# Mali Maker

Personal envelope budgeting for Stella: every shilling has a job.

- **Accounts**: where money sits (M-Pesa lines, banks, Etica, USDT, Deel). USD accounts are valued at the live rate.
- **Envelopes**: what money is for, in three tiers: Essentials (fixed, filled first), Building your future (tax, debt, emergency, investments, sinking funds), Lifestyle (capped).
- **Income split**: tax % first, then Needs to their targets, then the rest by percentage (Lifestyle / Sinking / Debt / Emergency / Invest). See `src/lib/engine.ts`.

## Run

```bash
cp .env.example .env.local   # fill in the keys
npm install
npm run dev
npm test                     # budget engine tests
```

The database lives in Supabase (`supabase/migrations`). All tables are `mali_*` with row-level security, so each signed-in user only sees their own rows.
