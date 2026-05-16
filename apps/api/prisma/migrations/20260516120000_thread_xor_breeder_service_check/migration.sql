-- Defesa em profundidade: o modelo Thread representa duas semanticas
-- mutuamente exclusivas — conversa entre dono e CRIADOR (breeder_id NOT
-- NULL, service_id NULL) ou entre dono e PRESTADOR de servico (service_id
-- NOT NULL, breeder_id NULL). A logica dos controllers ja respeita esta
-- invariante (dois branches estanques em messages/services controllers),
-- mas nada no schema impede que uma migration futura, um seed manual ou
-- um bug introduza uma linha com ambos os campos preenchidos (ou ambos
-- NULL). Esta migration adiciona uma CHECK constraint que torna a
-- invariante explicita ao nivel da base de dados.
--
-- As @@unique([owner_id, breeder_id]) e @@unique([owner_id, service_id])
-- existentes continuam validas: em Postgres, NULL e' tratado como
-- distinto em unique constraints, pelo que cada par so e' aplicado
-- quando a respectiva coluna nao e' NULL. Combinado com este CHECK,
-- temos: "exactamente um destino por thread, e no maximo uma thread
-- por par (dono, destino)".

ALTER TABLE "threads"
  DROP CONSTRAINT IF EXISTS "threads_target_xor",
  ADD CONSTRAINT "threads_target_xor"
    CHECK (
      (breeder_id IS NOT NULL AND service_id IS NULL)
      OR
      (breeder_id IS NULL AND service_id IS NOT NULL)
    );
