-- ============================================================
-- Golf Assistant: Initial Schema
-- Based on architecture-golf-assistant-2026-03-20.md v1.1
-- ============================================================

-- ユーザープロファイル
create table profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null unique,
  handicap numeric(3,1),
  play_style text,
  miss_tendency text,
  fatigue_note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- クラブ情報
create table clubs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade not null,
  name text not null,
  distance integer,
  is_weak boolean default false,
  confidence integer default 3,
  note text
);

-- コース情報
create table courses (
  id uuid primary key default gen_random_uuid(),
  gora_id text unique,
  name text not null,
  prefecture text,
  address text,
  layout_url text,
  raw_data jsonb,
  created_at timestamptz default now()
);

-- ホール情報
create table holes (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references courses(id) on delete cascade not null,
  hole_number integer not null check (hole_number between 1 and 18),
  par integer not null check (par between 3 and 5),
  distance integer,
  description text,
  unique (course_id, hole_number)
);

-- ホール別ユーザーメモ
create table hole_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  hole_id uuid references holes(id) on delete cascade not null,
  note text,
  strategy text,
  updated_at timestamptz default now(),
  unique (user_id, hole_id)
);

-- ラウンド
create table rounds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  course_id uuid references courses(id) not null,
  played_at date not null default current_date,
  context_snapshot jsonb,
  total_score integer,
  status text default 'in_progress' check (status in ('in_progress', 'completed')),
  created_at timestamptz default now()
);

-- ホール別スコア
create table scores (
  id uuid primary key default gen_random_uuid(),
  round_id uuid references rounds(id) on delete cascade not null,
  hole_number integer not null check (hole_number between 1 and 18),
  strokes integer check (strokes between 1 and 20),
  putts integer check (putts between 0 and 10),
  fairway_hit boolean,
  green_in_reg boolean,
  unique (round_id, hole_number)
);

-- ショット記録
create table shots (
  id uuid primary key default gen_random_uuid(),
  round_id uuid references rounds(id) on delete cascade not null,
  hole_number integer not null,
  shot_number integer not null,
  club text,
  result text check (result in ('excellent', 'good', 'fair', 'poor')),
  miss_type text,
  created_at timestamptz default now(),
  unique (round_id, hole_number, shot_number)
);

-- メモ
create table memos (
  id uuid primary key default gen_random_uuid(),
  round_id uuid references rounds(id) on delete cascade not null,
  hole_number integer,
  content text not null,
  source text default 'voice' check (source in ('voice', 'text')),
  created_at timestamptz default now()
);

-- ナレッジベース
create table knowledge (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  content text not null,
  category text not null,
  tags text[] default '{}',
  source_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================
-- Triggers: updated_at 自動更新
-- ============================================================

create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_updated_at before update on profiles
  for each row execute function update_updated_at();

create trigger set_updated_at before update on hole_notes
  for each row execute function update_updated_at();

create trigger set_updated_at before update on knowledge
  for each row execute function update_updated_at();

-- ============================================================
-- Row Level Security
-- ============================================================

alter table profiles enable row level security;
alter table clubs enable row level security;
alter table hole_notes enable row level security;
alter table rounds enable row level security;
alter table scores enable row level security;
alter table shots enable row level security;
alter table memos enable row level security;
alter table knowledge enable row level security;
alter table courses enable row level security;
alter table holes enable row level security;

-- profiles: ユーザーは自分のデータのみ
create policy "Users can CRUD own profiles" on profiles
  for all using (auth.uid() = user_id);

-- clubs: プロファイル経由で自分のクラブのみ
create policy "Users can CRUD own clubs" on clubs
  for all using (
    profile_id in (select id from profiles where user_id = auth.uid())
  );

-- hole_notes: 自分のメモのみ
create policy "Users can CRUD own hole_notes" on hole_notes
  for all using (auth.uid() = user_id);

-- rounds: 自分のラウンドのみ
create policy "Users can CRUD own rounds" on rounds
  for all using (auth.uid() = user_id);

-- scores: 自分のラウンドのスコアのみ
create policy "Users can CRUD own scores" on scores
  for all using (
    round_id in (select id from rounds where user_id = auth.uid())
  );

-- shots: 自分のラウンドのショットのみ
create policy "Users can CRUD own shots" on shots
  for all using (
    round_id in (select id from rounds where user_id = auth.uid())
  );

-- memos: 自分のラウンドのメモのみ
create policy "Users can CRUD own memos" on memos
  for all using (
    round_id in (select id from rounds where user_id = auth.uid())
  );

-- knowledge: 自分のナレッジのみ
create policy "Users can CRUD own knowledge" on knowledge
  for all using (auth.uid() = user_id);

-- courses/holes: 全ユーザー読み取り可能、認証済みユーザーのみINSERT/UPDATE可能
-- NOTE: DELETE は意図的にポリシー未設定（運用で制御）
create policy "Courses are readable by all" on courses
  for select using (true);
create policy "Authenticated users can insert courses" on courses
  for insert with check (auth.role() = 'authenticated');
create policy "Authenticated users can update courses" on courses
  for update using (auth.role() = 'authenticated');

create policy "Holes are readable by all" on holes
  for select using (true);
create policy "Authenticated users can insert holes" on holes
  for insert with check (auth.role() = 'authenticated');
create policy "Authenticated users can update holes" on holes
  for update using (auth.role() = 'authenticated');

-- ============================================================
-- Indexes
-- ============================================================

create index idx_rounds_user_id on rounds(user_id);
create index idx_rounds_played_at on rounds(played_at desc);
create index idx_scores_round_id on scores(round_id);
create index idx_shots_round_id on shots(round_id);
create index idx_knowledge_user_tags on knowledge using gin(tags);
create index idx_knowledge_user_category on knowledge(user_id, category);
create index idx_memos_round_id on memos(round_id);
create index idx_clubs_profile_id on clubs(profile_id);
