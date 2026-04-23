# UAreWell TheraCoach — Local Backend

Local replacement for the previous Cloudflare Workers setup.
Focus areas:

1. **Chat bot** — OpenRouter-backed assistant embedded on every page.
2. **Auto blog posting (2× per day)** — AI writes and publishes 2 posts daily.
3. **Auto Facebook cross-posting** — every post Susan publishes (manually from the admin OR automatically) is pushed to the Facebook Page.

AI generation, CMS, lead capture, and the multi-platform queue are all still in place.

## Quick start

```bash
cd "C:\Users\rlyzion\Desktop\Susan's Scripts\server"
npm install          # one time
npm start            # http://localhost:8787 (site + API)
```

In another terminal (keeps running for auto-posting):

```bash
npm run scheduler    # posts 2 blogs a day at the times in BLOG_TIMES
```

Open:
- Site  → http://localhost:8787/index.html
- Blog  → http://localhost:8787/blog.html
- Admin → http://localhost:8787/admin.html   (password in `.env` → `ADMIN_PASSWORD`)

---

## 1. Chat bot

- Endpoint: `POST /chat`, body `{messages:[{role,content}]}` → `{reply}`
- Model is `OPENROUTER_CHAT_MODEL` in `.env` (default `openai/gpt-4o-mini`)
- System prompt lives in [`lib/prompts.js`](lib/prompts.js) — edit to adjust voice/scope
- Automatic lead capture: when a visitor shares email or phone in chat, the assistant extracts name / email / phone / intent to `data/leads.json` and emails Susan (if SMTP is set)

## 2. Auto blog posting — 2 posts / day

```bash
npm run scheduler
```

Default schedule is **09:00 and 17:00 local time**. Override in `.env`:

```
BLOG_TIMES=09:00,17:00
```

What happens at each trigger:

1. Picks a fresh topic from the pool in [`scripts/generate-blog.js`](scripts/generate-blog.js) (topics you've already covered are skipped)
2. Calls OpenRouter (`OPENROUTER_BLOG_MODEL`, default Claude Sonnet 4.5) to write a 700–1100 word markdown post
3. Saves to `data/posts.json` with `status: "published"`
4. Immediately cross-posts to every social platform with credentials set (see section 3)

One-off / manual generation:

```bash
npm run generate-blog                       # random topic, publish + social
npm run generate-blog -- "your topic here"  # specific topic
npm run generate-blog -- --draft            # save as draft only
npm run generate-blog -- --no-social        # skip social
```

To keep the scheduler running on Windows permanently, use Task Scheduler:
- Program: `C:\Program Files\nodejs\node.exe`
- Arguments: `scripts\scheduler.js`
- Start in: `C:\Users\rlyzion\Desktop\Susan's Scripts\server`

## 3. Auto Facebook cross-posting

Every post published — by the generator, the admin page, or `PUT /admin/posts/:slug` — triggers [`lib/social.js`](lib/social.js) → `publishToAll()`. Facebook is the primary target.

### One-time Facebook setup

You need a **Facebook Page** (not a personal profile) and a Page Access Token.

1. Go to https://developers.facebook.com/ → create or open your app
2. Add the **Facebook Login for Business** + **Pages API** products
3. Use the Graph API Explorer (https://developers.facebook.com/tools/explorer/) to issue a token with these scopes:
   `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`
4. Exchange the short-lived token for a **long-lived Page token** (never expires):
   ```
   GET https://graph.facebook.com/v20.0/{page_id}?fields=access_token&access_token={long_lived_user_token}
   ```
5. Put the values in `server/.env`:
   ```
   FB_PAGE_ID=123456789012345
   FB_PAGE_ACCESS_TOKEN=EAAG...long-token...
   ```
6. Restart the server.

From now on, every publish → one Facebook post. You can also force a re-post from the admin page (`Post to Social` button).

### Verifying it works

Publish a test post from the admin panel, then open the **Social Queue** tab. Each post shows `✓ posted` with the FB post ID, or a reason it failed (e.g. `missing-creds`, `permissions`). Also visible in `data/social-queue.json`.

### Other platforms (optional, keep or ignore)

Same file handles Instagram / LinkedIn / X if you set their tokens. Unset platforms silently queue to `social-queue.json` for manual posting — they don't break the flow.

---

## Data

All data lives in [`data/`](data/):
- `posts.json` — blog posts
- `leads.json` — contact form + chat-captured leads
- `social-queue.json` — social captions history per published post

## API summary

| Endpoint | Purpose |
|----------|---------|
| `POST /chat` | Chat bot |
| `POST /leads` | Contact form |
| `GET  /posts`, `GET /posts/:slug` | Public blog |
| `POST /admin/login` | Auth check |
| `GET/POST/PUT/DELETE /admin/posts[/:slug]` | CMS |
| `POST /admin/ai-write` | Generate a draft from a topic |
| `POST /admin/posts/:slug/publish-social` | Re-run social publish |
| `GET  /admin/leads`, `DELETE /admin/leads/:id` | Leads |
| `GET  /admin/social-queue` | Social history |
| `GET  /health` | Config status |

## Out of scope

- **Google Calendar** — booking intent in chat is redirected to the contact form / phone.
