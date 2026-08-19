-- ============================================================
-- AGRO·MAP — Parte 1: estrutura de login (Opção A) + campos de atendimento
-- Rode UMA vez no SQL Editor do Supabase.
-- ============================================================

-- 1) Garante a extensão de criptografia de senhas
create extension if not exists pgcrypto with schema extensions;

-- 2) Novos campos de atendimento nas fazendas
alter table fazendas add column if not exists rtv text;
alter table fazendas add column if not exists atv text;
alter table fazendas add column if not exists dm  text;

-- 3) Tabela de usuários (protegida: sem acesso público de leitura)
create table if not exists public.usuarios (
  login       text primary key,
  senha_hash  text not null,
  nome        text not null,
  papel       text not null default 'atv',   -- 'gestor' | 'dm' | 'atv'
  ve_tudo     boolean not null default false, -- true = enxerga todas as fazendas
  equipe      text[] default '{}'             -- nomes cujas fazendas este usuário também vê
);

alter table public.usuarios enable row level security;
-- (não criamos policy para o anon => a chave do navegador NÃO lê esta tabela)

-- 4) Função de login segura (confere a senha criptografada e devolve o perfil)
create or replace function public.verificar_login(p_login text, p_senha text)
returns table (nome text, papel text, ve_tudo boolean, equipe text[])
language sql
security definer
set search_path = public, extensions
as $$
  select u.nome, u.papel, u.ve_tudo, u.equipe
  from public.usuarios u
  where u.login = lower(p_login)
    and u.senha_hash = extensions.crypt(p_senha, u.senha_hash)
  limit 1;
$$;

grant execute on function public.verificar_login(text, text) to anon;

-- 5) Cria os 3 usuários com uma senha TEMPORÁRIA: trocar@123
--    (troque cada uma no passo 6 abaixo)
insert into public.usuarios (login, senha_hash, nome, papel, ve_tudo, equipe) values
 ('gilvano',  extensions.crypt('trocar@123', extensions.gen_salt('bf')), 'Gilvano Prado',    'gestor', true,  '{}'),
 ('fernando', extensions.crypt('trocar@123', extensions.gen_salt('bf')), 'Fernando Sousa',   'dm',     false, array['Milena Fernandes']),
 ('milena',   extensions.crypt('trocar@123', extensions.gen_salt('bf')), 'Milena Fernandes', 'atv',    false, '{}')
on conflict (login) do nothing;

-- 6) COMO TROCAR UMA SENHA (rode quando quiser, trocando o texto):
-- update public.usuarios
--   set senha_hash = extensions.crypt('SUA_NOVA_SENHA', extensions.gen_salt('bf'))
--   where login = 'milena';
