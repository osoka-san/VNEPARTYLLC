-- 40001 (serialization_failure) PostgREST повторяет автоматически → запрос с устаревшей версией зависал.
-- Меняем код бизнес-конфликта на PT409 (HTTP 409), логику функций не трогаем.
do $$
declare f record; def text;
begin
  for f in select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'private' and p.prokind = 'f' and p.prosrc like '%errcode = ''40001''%'
  loop
    def := replace(pg_get_functiondef(f.oid), 'errcode = ''40001''', 'errcode = ''PT409''');
    execute def;
  end loop;
end $$;