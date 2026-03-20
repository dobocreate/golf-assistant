-- STORY-006: holes テーブルに UPDATE ポリシーを追加（upsert対応）
create policy "Authenticated users can update holes" on holes
  for update using (auth.uid() is not null)
  with check (auth.uid() is not null);
