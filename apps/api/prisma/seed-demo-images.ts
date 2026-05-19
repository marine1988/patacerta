// =====================================================================
// PataCerta — Imagens dummy curadas (Unsplash)
// =====================================================================
//
// URLs permanentes de imagens livres do Unsplash (licenca Unsplash —
// uso comercial OK, sem necessidade de atribuicao). Usadas apenas no
// seed-demo (dev/stage). Producao usa uploads reais para o MinIO.
//
// Convencao: query params `?w=<width>&q=80&auto=format&fit=crop` garante
// que o CDN do Unsplash devolve um JPG optimizado para o tamanho pedido,
// independentemente da resolucao original. `&fit=crop` previne deformacao
// no aspect-ratio 4:3 dos cards.
//
// Selectores helper (`pickByIndex`) sao deterministicos para idempotencia
// do seed — uma photoSeed numero `2001` retorna sempre a mesma imagem
// entre runs, mesmo apos `db.drop`.
//
// Se uma URL Unsplash for despromovida no futuro, o frontend cai para
// <ImageFallback variant="..."> (silhueta editorial caramel). Sem
// imagens partidas.
//
// Nota: avatares de utilizadores NAO usam Unsplash. Usam DiceBear (ver
// `avatarForEmail`) — avatares gerados deterministicamente, sem fotos
// reais de pessoas em dev/stage.

/** Caes — perfis de criadores (800x600 4:3). Mix de racas em cenarios canil/exterior. */
export const BREEDER_PHOTOS = [
  // Golden retriever cachorros
  'https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=800&h=600&q=80&auto=format&fit=crop',
  // Labrador adulto em campo
  'https://images.unsplash.com/photo-1605568427561-40dd23c2acea?w=800&h=600&q=80&auto=format&fit=crop',
  // Husky/pastor branco — neve/campo
  'https://images.unsplash.com/photo-1568572933382-74d440642117?w=800&h=600&q=80&auto=format&fit=crop',
  // Pastor alemao
  'https://images.unsplash.com/photo-1589941013453-ec89f33b5e95?w=800&h=600&q=80&auto=format&fit=crop',
  // Border collie em accao
  'https://images.unsplash.com/photo-1591769225440-811ad7d6eab3?w=800&h=600&q=80&auto=format&fit=crop',
  // Cachorros mistos a brincar
  'https://images.unsplash.com/photo-1450778869180-41d0601e046e?w=800&h=600&q=80&auto=format&fit=crop',
  // Cao grande deitado em pavilhao
  'https://images.unsplash.com/photo-1583337130417-3346a1be7dee?w=800&h=600&q=80&auto=format&fit=crop',
  // Cachorro pequeno retrato
  'https://images.unsplash.com/photo-1561037404-61cd46aa615b?w=800&h=600&q=80&auto=format&fit=crop',
  // Cao adulto a correr
  'https://images.unsplash.com/photo-1552053831-71594a27632d?w=800&h=600&q=80&auto=format&fit=crop',
  // Familia de cachorros recem nascidos
  'https://images.unsplash.com/photo-1530281700549-e82e7bf110d6?w=800&h=600&q=80&auto=format&fit=crop',
  // Cao adulto em quintal
  'https://images.unsplash.com/photo-1517423440428-a5a00ad493e8?w=800&h=600&q=80&auto=format&fit=crop',
  // Cavalier king charles
  'https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=800&h=600&q=80&auto=format&fit=crop',
  // Bichon frise pequeno
  'https://images.unsplash.com/photo-1583511655857-d19b40a7a54e?w=800&h=600&q=80&auto=format&fit=crop',
  // Cao pastor branco em monte
  'https://images.unsplash.com/photo-1551717743-49959800b1f6?w=800&h=600&q=80&auto=format&fit=crop',
  // Dois cachorros castanhos
  'https://images.unsplash.com/photo-1582456891925-a53965520520?w=800&h=600&q=80&auto=format&fit=crop',
] as const

/** Servicos passeio — cao com trela / ao ar livre / na cidade. */
export const SERVICE_WALKING_PHOTOS = [
  // Cao com trela em passeio urbano
  'https://images.unsplash.com/photo-1494947665470-20322015e3a8?w=800&h=600&q=80&auto=format&fit=crop',
  // Dog walker com varios caes
  'https://images.unsplash.com/photo-1601758228041-f3b2795255f1?w=800&h=600&q=80&auto=format&fit=crop',
  // Pessoa passeia cao no parque
  'https://images.unsplash.com/photo-1450778869180-41d0601e046e?w=800&h=600&q=80&auto=format&fit=crop',
  // Caminhada na natureza com cao
  'https://images.unsplash.com/photo-1530281700549-e82e7bf110d6?w=800&h=600&q=80&auto=format&fit=crop',
  // Cao a correr no campo
  'https://images.unsplash.com/photo-1548199973-03cce0bbc87b?w=800&h=600&q=80&auto=format&fit=crop',
  // Caminhada com cao na praia
  'https://images.unsplash.com/photo-1444212477490-ca407925329e?w=800&h=600&q=80&auto=format&fit=crop',
  // Cao e dono trail running
  'https://images.unsplash.com/photo-1576201836106-db1758fd1c97?w=800&h=600&q=80&auto=format&fit=crop',
  // Trela em close-up
  'https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=800&h=600&q=80&auto=format&fit=crop',
] as const

/** Servicos pet-sitting — cao em casa / brincadeira / repouso. */
export const SERVICE_SITTING_PHOTOS = [
  // Cao deitado em sofa
  'https://images.unsplash.com/photo-1450778869180-41d0601e046e?w=800&h=600&q=80&auto=format&fit=crop',
  // Pessoa com cao em casa
  'https://images.unsplash.com/photo-1583511655802-41dbe21b0d8e?w=800&h=600&q=80&auto=format&fit=crop',
  // Cao a dormir aconchegado
  'https://images.unsplash.com/photo-1601758228041-f3b2795255f1?w=800&h=600&q=80&auto=format&fit=crop',
  // Cao a comer
  'https://images.unsplash.com/photo-1568393691080-4ace7437697a?w=800&h=600&q=80&auto=format&fit=crop',
  // Cao com brinquedo
  'https://images.unsplash.com/photo-1601758124510-52d02ddb7cbd?w=800&h=600&q=80&auto=format&fit=crop',
  // Cao no quintal a brincar
  'https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=800&h=600&q=80&auto=format&fit=crop',
  // Pet sitter a cuidar
  'https://images.unsplash.com/photo-1548199973-03cce0bbc87b?w=800&h=600&q=80&auto=format&fit=crop',
] as const

/** Servicos treino — cao em obediencia / agility / sentado. */
export const SERVICE_TRAINING_PHOTOS = [
  // Cao em sit em campo
  'https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=800&h=600&q=80&auto=format&fit=crop',
  // Treino com recompensa
  'https://images.unsplash.com/photo-1583337130417-3346a1be7dee?w=800&h=600&q=80&auto=format&fit=crop',
  // Cao com trela em obediencia
  'https://images.unsplash.com/photo-1591769225440-811ad7d6eab3?w=800&h=600&q=80&auto=format&fit=crop',
  // Treinador profissional com cao
  'https://images.unsplash.com/photo-1548199973-03cce0bbc87b?w=800&h=600&q=80&auto=format&fit=crop',
] as const

/**
 * Seleccao deterministica por indice. O `seed` numerico do dataset
 * (ex.: photoSeeds [2001, 2002, 2003]) e' mapeado modulo length do pool
 * — runs repetidos do seed devolvem sempre a mesma imagem por slot, mas
 * o spread cobre todo o pool para variedade visual em paginas de listing.
 */
export function pickByIndex<T>(pool: readonly T[], seed: number): T {
  // Math.abs para suportar seeds negativos hipoteticos; |0 normaliza floats.
  const idx = Math.abs(seed | 0) % pool.length
  return pool[idx]
}

/**
 * URL avatar para utilizador pelo email — DiceBear (avatares gerados
 * deterministicamente a partir do email como seed).
 *
 * Porque DiceBear em vez de fotos reais (Unsplash):
 *  - Avatares dev/stage devem ser obviamente fake (avatares ilustrativos),
 *    nao fotos reais de pessoas (privacidade + risco de despromocao do
 *    photoId).
 *  - DiceBear devolve sempre uma imagem valida para qualquer string seed
 *    (zero falhas/404).
 *  - Sem dependencia de licencas/CDNs externos serem permanentes.
 *
 * Style `initials` usa as iniciais do email com cores deterministicas —
 * leitura instantanea e profissional. Para variedade visual maior pode-se
 * trocar para `lorelei`/`adventurer` (avatares ilustrados).
 */
export function avatarForEmail(email: string): string {
  // encodeURIComponent para suportar `+` em emails tipo `rita+stage@...`.
  // backgroundType `gradientLinear` adiciona profundidade visual.
  return `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(email)}&backgroundType=gradientLinear&fontSize=42`
}

/** URL passa-fotos breeder por seed. */
export function breederPhotoForSeed(seed: number): string {
  return pickByIndex(BREEDER_PHOTOS, seed)
}

/** URL service por categoria + seed. */
export function servicePhotoForSeed(
  category: 'passeio' | 'pet-sitting' | 'treino',
  seed: number,
): string {
  const pool =
    category === 'pet-sitting'
      ? SERVICE_SITTING_PHOTOS
      : category === 'treino'
        ? SERVICE_TRAINING_PHOTOS
        : SERVICE_WALKING_PHOTOS
  return pickByIndex(pool, seed)
}
