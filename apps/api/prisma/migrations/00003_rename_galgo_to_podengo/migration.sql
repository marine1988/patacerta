-- Rename do slug `galgo-portugues` -> `podengo-portugues` (card PATA-REL-FIX-1 / REL-03).
--
-- Contexto: o catálogo editorial (`prisma/breeds-data.ts` + `BREED_IMAGES`) passou a
-- chamar `podengo-portugues` a esta raça. A base de dados de produção ainda tem o slug
-- antigo. Sem este rename, o job de boot `backfill-breed-images` (que apaga as raças
-- fora do catálogo) removia a linha e o Podengo Português desaparecia do site, da lista
-- de raças e do matcher (104 -> 103 raças).
--
-- Propriedades:
--   * actualiza a linha existente, logo preserva o `id` e todas as referências
--     (`breeder_breeds.breed_id`, `sponsored_breed_slots.breed_id`);
--   * idempotente: no-op quando o slug já é o novo;
--   * seguro quando as duas linhas coexistem (stage já renomeado + produção a chegar):
--     o `NOT EXISTS` evita violar `breeds_name_slug_key`; nesse caso não toca em nada
--     e o backfill trata da duplicada.
--
-- Verificação depois do deploy: `GET /api/breeds` -> 104 raças, `podengo-portugues`
-- presente e `galgo-portugues` ausente.

UPDATE "breeds"
SET "name_slug" = 'podengo-portugues', "updated_at" = now()
WHERE "name_slug" = 'galgo-portugues'
  AND NOT EXISTS (SELECT 1 FROM "breeds" WHERE "name_slug" = 'podengo-portugues');
