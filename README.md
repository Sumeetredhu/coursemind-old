# CourseMind

Before exams I always end up jumping between slide PDFs, 2 hour lecture videos and old question papers.
So I made CourseMind. You put all your course stuff in one place and it turns it into notes,
flashcards, quizzes and a practice viva.

The main thing: every note shows where it came from. Click the small tag next to a point and it
opens that exact page of the PDF (with the line highlighted), or plays the lecture video from that exact second.
So you can always check it yourself.

## What it does

- **Sources** - add a YouTube lecture link or upload PDFs (slides, notes, even scanned handwritten pages)
- **Notes** - your course gets split into topics and you get short notes for each one, with a source tag on every point
- **Flashcards** - made along with the notes. Easy cards come back less often, hard ones come back sooner
- **Ask** - ask anything about the course. It only answers from your own material and shows where each line came from
- **Past papers** - upload old exam papers. It pulls out every question and shows which topics get asked the most
- **Quiz** - a fresh quiz in the style of your past papers. Short answers get checked with feedback
- **Viva** - 5 questions on a topic, like an oral exam. It goes deeper when you answer well. You can type or speak

## How it works

- When you add something, it goes into a job queue. Background workers pick up the jobs one by one.
- PDFs get read page by page and cut into small pieces. Each piece remembers its page and where on the page it was.
- For videos it uses the YouTube captions. If a video has none, Gemini watches it and writes them.
- Every piece gets saved in Postgres along with an embedding, so it can be searched by meaning and by keywords.
- For notes, Gemini first groups the pieces into topics, then writes notes for each topic and says which
  pieces every point came from. Anything that doesn't point to a real piece gets thrown away.

The job queue is just a table in Postgres. Workers grab jobs with `FOR UPDATE SKIP LOCKED`, so two workers
never get the same job. Jobs send a heartbeat while running, so if a server dies in the middle, another worker
picks the job up again.

Gemini's free plan only gives around 20 requests a day per model. So the app keeps a list of models and
switches to the next one when one runs out or is too busy. If all of them are out, jobs just wait for the
limit to reset and carry on by themselves.

## Built with

- Next.js, TypeScript, Tailwind
- Python, FastAPI
- Supabase (Postgres + pgvector, login, file storage)
- Google Gemini

## Running it yourself

You need Python 3.12+, [uv](https://docs.astral.sh/uv/), Node 20+, a Supabase account and a Gemini API key.
All of these are free.

**1. Supabase setup**

- Make a new project
- Project Settings > Database > reset the database password (letters and numbers only is easiest)
- Click **Connect** at the top, choose **Session pooler** and copy the connection string
- Project Settings > API Keys, copy the publishable key and the secret key
- Authentication > Sign In / Providers, turn off **Confirm email**

**2. Gemini key**

Go to aistudio.google.com, click **Get API key** and make one. Don't add billing and it stays free.

**3. Backend**

```bash
cd api
cp .env.example .env
```

Put your keys in `api/.env`, then:

```bash
uv sync
uv run python -m app.setup_db
uv run uvicorn app.main:app --port 8000
```

`setup_db` makes the tables and the storage bucket. You only run it once.

**4. Frontend**

```bash
cd web
cp .env.example .env.local
```

Put your Supabase URL and publishable key in `web/.env.local`, then:

```bash
npm install
npm run dev
```

Now open http://localhost:3000, make an account and add your first course.

**Tests**

```bash
cd api
uv run pytest
```

## Good to know

- Everything here runs on free plans. Nothing can charge you unless you add a card yourself.
- On Gemini's free plan, Google can use what you send to improve their models. Slides are fine, just don't upload anything private.

## Folders

```
api/              backend
  app/ingest/     reading PDFs and YouTube videos
  app/routes/     API endpoints
  app/jobs.py     the job queue
  app/llm.py      Gemini calls and model switching
  app/notes.py    topics, notes and flashcards
  app/search.py   search by meaning + keywords
  app/quiz.py     quizzes
  app/viva.py     the viva
web/              frontend
  src/app/        pages
  src/components/ tabs, PDF viewer, source tags
```

## Things I want to add

- Coding practice questions that run against hidden test cases
- Sharing a course with friends
- The examiner talking back in the viva
