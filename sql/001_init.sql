-- ============================================================
-- 001_init.sql — DDL cho 8 bang v1.0 MVP
-- DataSense — Ung dung hoc tieng Trung
-- ============================================================

-- 1. hsk_levels
CREATE TABLE hsk_levels (
    id   INT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT
);

INSERT INTO hsk_levels (id, name, description) VALUES
    (1, 'HSK 1', 'Beginner — 150 tu'),
    (2, 'HSK 2', 'Elementary — 300 tu'),
    (3, 'HSK 3', 'Intermediate — 600 tu'),
    (4, 'HSK 4', 'Upper Intermediate — 1200 tu'),
    (5, 'HSK 5', 'Advanced — 2500 tu'),
    (6, 'HSK 6', 'Proficient — 5000+ tu');

ALTER TABLE hsk_levels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hsk_levels_read" ON hsk_levels
    FOR SELECT TO authenticated
    USING (true);

-- 2. profiles (extends auth.users)
CREATE TABLE profiles (
    id               UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name     TEXT,
    avatar_url       TEXT,
    current_hsk_level INT REFERENCES hsk_levels(id) DEFAULT 1,
    enabled_features TEXT[] DEFAULT '{}',
    created_at       TIMESTAMPTZ DEFAULT now(),
    updated_at       TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_own" ON profiles
    FOR ALL TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- Trigger: tu tao profile khi user dang ky
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, display_name, avatar_url)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', 'User'),
        COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- 3. vocabulary
CREATE TABLE vocabulary (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hanzi            TEXT NOT NULL,
    pinyin           TEXT NOT NULL,
    meaning_vi       TEXT NOT NULL,
    hsk_level        INT REFERENCES hsk_levels(id),
    audio_url        TEXT,
    created_by       UUID REFERENCES profiles(id),
    source_lesson_id UUID,
    usage_count      INT DEFAULT 0,
    created_at       TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE vocabulary ENABLE ROW LEVEL SECURITY;

-- Ai cung doc duoc vocabulary public (created_by IS NULL = official)
CREATE POLICY "vocabulary_read" ON vocabulary
    FOR SELECT TO authenticated
    USING (true);

-- User chi insert/update/delete tu cua minh
CREATE POLICY "vocabulary_insert" ON vocabulary
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = created_by);

CREATE POLICY "vocabulary_update" ON vocabulary
    FOR UPDATE TO authenticated
    USING (auth.uid() = created_by);

CREATE POLICY "vocabulary_delete" ON vocabulary
    FOR DELETE TO authenticated
    USING (auth.uid() = created_by);

-- 4. lessons
CREATE TABLE lessons (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title       TEXT NOT NULL,
    hsk_level   INT REFERENCES hsk_levels(id),
    creator_id  UUID REFERENCES profiles(id),
    visibility  TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'unlisted', 'public')),
    source_type TEXT NOT NULL DEFAULT 'curated' CHECK (source_type IN ('curated', 'community', 'ai_generated')),
    upvotes     INT DEFAULT 0,
    downvotes   INT DEFAULT 0,
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;

-- Doc duoc neu public HOAC la cua minh HOAC la official (creator_id IS NULL)
CREATE POLICY "lessons_read" ON lessons
    FOR SELECT TO authenticated
    USING (
        visibility = 'public'
        OR creator_id = auth.uid()
        OR creator_id IS NULL
    );

CREATE POLICY "lessons_insert" ON lessons
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "lessons_update" ON lessons
    FOR UPDATE TO authenticated
    USING (auth.uid() = creator_id);

CREATE POLICY "lessons_delete" ON lessons
    FOR DELETE TO authenticated
    USING (auth.uid() = creator_id);

-- 5. lesson_items
CREATE TABLE lesson_items (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lesson_id   UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    item_type   TEXT NOT NULL CHECK (item_type IN ('vocab', 'grammar', 'translation')),
    item_id     UUID NOT NULL,
    order_index INT NOT NULL DEFAULT 0
);

ALTER TABLE lesson_items ENABLE ROW LEVEL SECURITY;

-- Ke thua quyen tu lesson cha
CREATE POLICY "lesson_items_read" ON lesson_items
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM lessons
            WHERE lessons.id = lesson_items.lesson_id
            AND (lessons.visibility = 'public' OR lessons.creator_id = auth.uid() OR lessons.creator_id IS NULL)
        )
    );

CREATE POLICY "lesson_items_insert" ON lesson_items
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM lessons
            WHERE lessons.id = lesson_items.lesson_id
            AND lessons.creator_id = auth.uid()
        )
    );

CREATE POLICY "lesson_items_update" ON lesson_items
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM lessons
            WHERE lessons.id = lesson_items.lesson_id
            AND lessons.creator_id = auth.uid()
        )
    );

CREATE POLICY "lesson_items_delete" ON lesson_items
    FOR DELETE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM lessons
            WHERE lessons.id = lesson_items.lesson_id
            AND lessons.creator_id = auth.uid()
        )
    );

CREATE INDEX idx_lesson_items_lesson ON lesson_items (lesson_id, item_type);

-- 6. user_word_progress (SRS data)
CREATE TABLE user_word_progress (
    user_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    vocabulary_id UUID NOT NULL REFERENCES vocabulary(id) ON DELETE CASCADE,
    mastery_level INT DEFAULT 0,
    last_seen_at  TIMESTAMPTZ,
    next_review_at TIMESTAMPTZ,
    ease_factor   FLOAT DEFAULT 2.5,
    interval_days INT DEFAULT 1,
    times_correct INT DEFAULT 0,
    times_wrong   INT DEFAULT 0,
    PRIMARY KEY (user_id, vocabulary_id)
);

ALTER TABLE user_word_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_word_progress_own" ON user_word_progress
    FOR ALL TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- 7. quiz_sessions
CREATE TABLE quiz_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    lesson_id       UUID REFERENCES lessons(id),
    score           INT NOT NULL DEFAULT 0,
    total_questions INT NOT NULL DEFAULT 0,
    completed_at    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE quiz_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quiz_sessions_own" ON quiz_sessions
    FOR ALL TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- 8. quiz_answers
CREATE TABLE quiz_answers (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id    UUID NOT NULL REFERENCES quiz_sessions(id) ON DELETE CASCADE,
    vocabulary_id UUID NOT NULL REFERENCES vocabulary(id),
    is_correct    BOOLEAN NOT NULL,
    time_spent_ms INT
);

ALTER TABLE quiz_answers ENABLE ROW LEVEL SECURITY;

-- Ke thua quyen tu quiz_session cha
CREATE POLICY "quiz_answers_own" ON quiz_answers
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM quiz_sessions
            WHERE quiz_sessions.id = quiz_answers.session_id
            AND quiz_sessions.user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM quiz_sessions
            WHERE quiz_sessions.id = quiz_answers.session_id
            AND quiz_sessions.user_id = auth.uid()
        )
    );
