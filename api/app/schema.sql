create extension if not exists vector with schema extensions;

create table if not exists courses (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null,
    name text not null,
    notes_status text not null default 'none',
    notes_error text,
    created_at timestamptz not null default now()
);
create index if not exists courses_owner_idx on courses (owner_id);

create table if not exists sources (
    id uuid primary key default gen_random_uuid(),
    course_id uuid not null references courses (id) on delete cascade,
    kind text not null,
    role text not null default 'material',
    title text not null,
    url text,
    video_id text,
    file_path text,
    content_hash text,
    year int,
    page_count int,
    duration_sec int,
    status text not null default 'queued',
    error text,
    created_at timestamptz not null default now()
);
create index if not exists sources_course_idx on sources (course_id);

create table if not exists chunks (
    id uuid primary key default gen_random_uuid(),
    source_id uuid not null references sources (id) on delete cascade,
    course_id uuid not null references courses (id) on delete cascade,
    position int not null,
    text text not null,
    page int,
    bbox real[],
    start_sec real,
    end_sec real,
    embedding vector(768),
    tsv tsvector generated always as (to_tsvector('english', text)) stored
);
create index if not exists chunks_course_idx on chunks (course_id);
create index if not exists chunks_source_idx on chunks (source_id);
create index if not exists chunks_tsv_idx on chunks using gin (tsv);

create table if not exists topics (
    id uuid primary key default gen_random_uuid(),
    course_id uuid not null references courses (id) on delete cascade,
    position int not null,
    title text not null,
    summary text not null default '',
    chunk_ids uuid[] not null default '{}',
    notes jsonb
);
create index if not exists topics_course_idx on topics (course_id);

create table if not exists flashcards (
    id uuid primary key default gen_random_uuid(),
    course_id uuid not null references courses (id) on delete cascade,
    topic_id uuid references topics (id) on delete cascade,
    front text not null,
    back text not null,
    cites uuid[] not null default '{}',
    ease real not null default 2.5,
    interval_days real not null default 0,
    reps int not null default 0,
    lapses int not null default 0,
    due_at timestamptz not null default now()
);
create index if not exists flashcards_due_idx on flashcards (course_id, due_at);

create table if not exists paper_questions (
    id uuid primary key default gen_random_uuid(),
    course_id uuid not null references courses (id) on delete cascade,
    source_id uuid not null references sources (id) on delete cascade,
    topic_id uuid references topics (id) on delete set null,
    year int,
    number text not null default '',
    text text not null,
    marks real,
    page int
);
create index if not exists paper_questions_course_idx on paper_questions (course_id);

create table if not exists quizzes (
    id uuid primary key default gen_random_uuid(),
    course_id uuid not null references courses (id) on delete cascade,
    topic_id uuid references topics (id) on delete set null,
    questions jsonb not null,
    created_at timestamptz not null default now()
);

create table if not exists quiz_attempts (
    id uuid primary key default gen_random_uuid(),
    quiz_id uuid not null references quizzes (id) on delete cascade,
    answers jsonb not null,
    results jsonb not null,
    score real not null,
    created_at timestamptz not null default now()
);

create table if not exists viva_sessions (
    id uuid primary key default gen_random_uuid(),
    course_id uuid not null references courses (id) on delete cascade,
    topic_id uuid references topics (id) on delete set null,
    chunk_ids uuid[] not null,
    turns jsonb not null default '[]',
    report jsonb,
    created_at timestamptz not null default now()
);

create table if not exists jobs (
    id bigserial primary key,
    kind text not null,
    payload jsonb not null,
    status text not null default 'queued',
    attempts int not null default 0,
    run_after timestamptz not null default now(),
    locked_at timestamptz,
    error text,
    created_at timestamptz not null default now()
);
create index if not exists jobs_waiting_idx on jobs (run_after) where status = 'queued';

alter table courses enable row level security;
alter table sources enable row level security;
alter table chunks enable row level security;
alter table topics enable row level security;
alter table flashcards enable row level security;
alter table paper_questions enable row level security;
alter table quizzes enable row level security;
alter table quiz_attempts enable row level security;
alter table viva_sessions enable row level security;
alter table jobs enable row level security;
