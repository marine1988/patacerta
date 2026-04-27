// ============================================
// PataCerta — Tipos de avaliações partilhados
// ============================================
//
// Espelha os campos devolvidos pela API para avaliações de criadores
// e serviços. As variantes "Dashboard" incluem campos só visíveis ao
// próprio (moderationReason, updatedAt) e os identificadores usados
// em mutations.
//
// Quando uma página precisa de campos relacionais extra (ex.: nome do
// criador ou título do serviço), faz intersection:
//
//   type Item = ReviewItem & { breeder: { id: number; businessName: string } }

/** Forma mínima comum a todas as avaliações exibidas no frontend. */
export interface ReviewBase {
  id: number
  rating: number
  title: string
  body: string | null
  status: string
  reply: string | null
  repliedAt: string | null
  createdAt: string
  author: {
    id: number
    firstName: string
    lastName: string
    avatarUrl: string | null
  }
}

/** Avaliação a um criador (perfil público). */
export interface ReviewItem extends ReviewBase {
  authorId: number
}

/** Avaliação a um criador no dashboard (campos do próprio). */
export interface DashboardReviewItem extends ReviewItem {
  breederId: number
  moderationReason: string | null
  updatedAt: string
}

/** Avaliação a um serviço (página pública do serviço). */
export interface ServiceReviewItem extends ReviewBase {
  serviceId: number
  authorId: number
}

/** Avaliação a um serviço no dashboard (campos do próprio). */
export interface DashboardServiceReviewItem extends ServiceReviewItem {
  moderationReason: string | null
  updatedAt: string
}
