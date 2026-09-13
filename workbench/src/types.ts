export type Goal = {
  id: string
  text: string
  done: boolean
  source?: string
  date?: string
}

export type RepoItem = {
  id: string
  name: string
  fullName: string
  url: string
  description: string
  stars: number
  language?: string | null
  topics?: string[]
  reason: string
}

export type PhItem = {
  name: string
  tagline: string
  url: string
  votes: number | null
  topics?: string[]
  insight: string
}

export type Board = {
  date: string
  builtAt: string
  about: { role: string; who: string; direction: string }
  goals: Goal[]
  github: RepoItem[]
  githubMeta?: { syncedAt?: string; auth?: boolean; errors?: string[] }
  producthunt: PhItem[]
  producthuntMeta?: { syncedAt?: string; mode?: string; errors?: string[] }
  links?: Record<string, string>
  error?: string
  hint?: string
}

export type View = 'home' | 'goals' | 'github' | 'ph' | 'about' | 'job'
