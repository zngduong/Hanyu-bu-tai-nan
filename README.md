# DataSense — Ung dung hoc tieng Trung

Ung dung hoc tieng Trung ket hop 3 yeu to:

- **Curated content**: bai hoc HSK chuan do admin bien soan
- **User-generated content (UGC)**: nguoi hoc dong gop tu vung, ngu phap, bai dich tu chuong trinh hoc ca nhan, group theo bai de nguoi sau dung lai
- **AI Agent**: tu sinh bai luyen tap (ghep cau, fill-in-the-blank, dich nguoc...) tu chinh du lieu UGC

## Stack cong nghe

| Tang | Cong nghe | Ly do chon |
|------|-----------|------------|
| **Frontend** | HTML/CSS/Vanilla JS | Giu phong cach project hien tai, khong can build step |
| **Hosting** | Cloudflare Pages | Free, unlimited bandwidth, deploy tu Git |
| **Auth** | Supabase Auth + Google OAuth | SDK goi truc tiep tu browser, khong can backend rieng |
| **Database** | Supabase Postgres + RLS | Multi-tenancy bao ve o tang DB, an toan du key lo |
| **Server logic** | Supabase Edge Functions (Deno) | Cho AI agent, leaderboard, cron jobs (tu v1.5) |
| **LLM** | Anthropic Claude API hoac OpenAI | Generate exercises tu UGC corpus |

## Cau truc thu muc

```
Hanyu-bu-tai-nan/
├── docs/
│   ├── architecture.md    # Kien truc tong the & AI Agent
│   ├── database-schema.md # Database schema & RLS policies
│   └── roadmap.md         # Lo trinh phat trien v1.0 → v2.0
├── sql/
│   └── 001_init.sql       # DDL cho 8 bang v1.0
├── LICENSE
└── README.md
```

## Tai lieu chi tiet

- [Kien truc he thong](docs/architecture.md) — kien truc tong the, AI Agent, SRS flashcard
- [Database Schema](docs/database-schema.md) — ERD, bang du lieu, RLS policies
- [Roadmap](docs/roadmap.md) — lo trinh 10 version tu MVP den Speaking/Listening

## Bat dau

> Chi tiet setup se duoc bo sung khi bat dau implement v1.0.

1. Setup Supabase project + Google OAuth credentials
2. Chay file `sql/001_init.sql` tren Supabase SQL Editor
3. Deploy frontend len Cloudflare Pages connect Git
4. Test RLS bang 2 user khac nhau
