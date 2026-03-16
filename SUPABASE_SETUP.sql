-- ============================================================
-- BOW 360 · Radar Político — Supabase Setup
-- Execute no Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. HABILITAR RLS nas tabelas
-- ============================================================
ALTER TABLE liderancas ENABLE ROW LEVEL SECURITY;
ALTER TABLE entrevistas ENABLE ROW LEVEL SECURITY;


-- 2. POLICIES — Usuários autenticados podem ler tudo
-- ============================================================
CREATE POLICY "Autenticados podem ler liderancas"
  ON liderancas FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Autenticados podem ler entrevistas"
  ON entrevistas FOR SELECT
  TO authenticated
  USING (true);


-- 3. POLICIES — Usuários autenticados podem inserir/atualizar
-- ============================================================
CREATE POLICY "Autenticados podem inserir liderancas"
  ON liderancas FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Autenticados podem atualizar liderancas"
  ON liderancas FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Autenticados podem inserir entrevistas"
  ON entrevistas FOR INSERT
  TO authenticated
  WITH CHECK (true);


-- 4. POLICY — service_role do n8n pode fazer tudo (sem RLS)
-- (O service_role já bypassa RLS automaticamente no Supabase)
-- Nenhuma policy adicional necessária para o n8n.


-- 5. POLICY — anon pode SOMENTE INSERIR via n8n webhook
-- (Opcional: só se quiser que o n8n use a anon key em vez da service_role)
-- CREATE POLICY "Anon pode inserir liderancas"
--   ON liderancas FOR INSERT
--   TO anon
--   WITH CHECK (true);


-- ============================================================
-- 6. MIGRAÇÃO — Adicionar coluna foto_url à tabela liderancas
-- Execute se ainda não existir (é seguro rodar múltiplas vezes)
-- ============================================================
ALTER TABLE liderancas ADD COLUMN IF NOT EXISTS foto_url TEXT;


-- ============================================================
-- 7. TABELA follow_ups — Agenda de Follow-ups por Liderança
-- ============================================================
CREATE TABLE IF NOT EXISTS follow_ups (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lider_id      UUID NOT NULL REFERENCES liderancas(id) ON DELETE CASCADE,
  titulo        TEXT NOT NULL,
  descricao     TEXT,
  data_agendada TIMESTAMPTZ NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pendente', -- 'pendente' | 'concluido' | 'cancelado'
  criado_em     TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE follow_ups ENABLE ROW LEVEL SECURITY;

-- Policies — authenticated users can do everything
CREATE POLICY "Autenticados podem ler follow_ups"
  ON follow_ups FOR SELECT TO authenticated USING (true);

CREATE POLICY "Autenticados podem inserir follow_ups"
  ON follow_ups FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Autenticados podem atualizar follow_ups"
  ON follow_ups FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Autenticados podem apagar follow_ups"
  ON follow_ups FOR DELETE TO authenticated USING (true);

-- Index for fast per-leader queries
CREATE INDEX IF NOT EXISTS idx_follow_ups_lider_id ON follow_ups(lider_id);
CREATE INDEX IF NOT EXISTS idx_follow_ups_data ON follow_ups(data_agendada);


-- ============================================================
-- VERIFICAR SE TUDO ESTÁ OK
-- ============================================================
-- SELECT schemaname, tablename, policyname, cmd, roles
-- FROM pg_policies
-- WHERE tablename IN ('liderancas', 'entrevistas');
