import { useRef } from 'react'

const PETAL_COUNT = 10
const PETALS = ['🌸', '💮', '🌺', '✿', '❀']

interface Petal {
  id: number
  left: number
  delay: number
  duration: number
  size: number
  drift: number
  emoji: string
}

function createPetal(id: number): Petal {
  return {
    id,
    left: Math.random() * 100,
    delay: Math.random() * 15,
    duration: 8 + Math.random() * 12,
    size: 10 + Math.random() * 14,
    drift: (Math.random() - 0.5) * 120,
    emoji: PETALS[Math.floor(Math.random() * PETALS.length)]
  }
}

export default function SakuraParticles() {
  const petalsRef = useRef<Petal[]>(
    Array.from({ length: PETAL_COUNT }, (_, i) => createPetal(i))
  )

  return (
    <div className="sakura-container">
      {petalsRef.current.map((petal) => (
        <div
          key={petal.id}
          className="sakura-petal"
          style={{
            left: `${petal.left}%`,
            fontSize: `${petal.size}px`,
            animationDelay: `${petal.delay}s`,
            animationDuration: `${petal.duration}s`,
            '--drift': `${petal.drift}px`,
            willChange: 'transform'
          } as React.CSSProperties}
        >
          {petal.emoji}
        </div>
      ))}
    </div>
  )
}
