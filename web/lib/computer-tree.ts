import raw from "@/data/computer-tree/computer_tree.json"

/**
 * The Computer Tree, laid out once on the server.
 *
 * SOURCE. public/computer-tree/computer_tree.json, as delivered with its data
 * card (public/computer-tree/DATACARD.md): the 1961 US Army "Computer Tree"
 * chart, transcribed, and extended one ring per decade to 2025. 542 nodes,
 * 614 links. Do not hand-edit the JSON; it is the dataset, and the CSVs beside
 * it are the same rows.
 *
 * THE LAYOUT IS THE CHART'S. A radial tree with ENIAC at the trunk and one ring
 * per period: 1950, 1955 and 1960 from the original chart, then a ring per
 * decade to 2030 (the open one, 2021 to 2025). A node sits inside its `ring`
 * band, placed by its year within that band; the 109 undated 1961 nodes sit at
 * a fixed depth in theirs, because the chart only places them that precisely.
 *
 * THE TREE IS THE PRIMARY PARENTS. The data card: "The first edge listed for
 * each target is its primary parent. The tree layout uses it." Angles come
 * from that tree (leaves evenly around the circle, a parent at the middle of
 * its children). Every other edge is a cross-link and is drawn on request.
 *
 * Everything the client needs is computed here, path strings included, so the
 * browser receives geometry and never runs a layout.
 */

type RawNode = {
  id: string
  label: string
  year: string
  ring: number
  maker: string
  branch: string
  layer: string
  is_root: string
  notes: string
}
type RawLink = { source: string; target: string; relation: string; layer: string; confidence: string }

export type Relation = "successor" | "derived" | "uses_cpu" | "influence" | "compatible"

export interface TreeNode {
  id: string
  label: string
  year: number | null
  ring: number
  maker: string
  branch: string
  /** true for the 207 machines transcribed from the 1961 chart */
  chart: boolean
  notes: string
  x: number
  y: number
  /** index of the primary parent, -1 for the eight roots */
  parent: number
}

export interface TreeLink {
  s: number
  t: number
  rel: Relation
  /** `read` on the data card: clearly on the chart, or well established */
  firm: boolean
  primary: boolean
  d: string
}

export interface ComputerTreeData {
  nodes: TreeNode[]
  links: TreeLink[]
  rings: { year: number; r: number }[]
  /** the outer radius of the drawing, for the viewBox */
  extent: number
}

/** Outer radius of each ring. The 1950s get room: 206 of the 542 sit there. */
const RING_R: Record<number, number> = {
  1945: 0,
  1950: 60,
  1955: 140,
  1960: 240,
  1970: 285,
  1980: 330,
  1990: 375,
  2000: 420,
  2010: 465,
  2020: 510,
  2030: 555,
}
const RINGS = Object.keys(RING_R).map(Number).sort((a, b) => a - b)

/** Depth of an undated node inside its band, 0 inner edge to 1 outer. */
const UNDATED_T = 0.62

function radiusOf(ring: number, year: number | null): number {
  const i = RINGS.indexOf(ring)
  if (i <= 0) return 0
  const lo = RINGS[i - 1]
  const r0 = RING_R[lo]
  const r1 = RING_R[ring]
  // A node in ring R dates from after the previous ring up to R itself.
  const t = year == null ? UNDATED_T : Math.min(1, Math.max(0.12, (year - lo) / (ring - lo)))
  return r0 + t * (r1 - r0)
}

const f = (n: number) => Math.round(n * 10) / 10
const pt = (a: number, r: number) => [f(r * Math.sin(a)), f(-r * Math.cos(a))] as const

function build(): ComputerTreeData {
  const rawNodes = (raw as { nodes: RawNode[] }).nodes
  const rawLinks = (raw as { links: RawLink[] }).links
  const index = new Map(rawNodes.map((n, i) => [n.id, i]))

  const parent = new Array<number>(rawNodes.length).fill(-1)
  const kids: number[][] = rawNodes.map(() => [])
  const seen = new Set<number>()
  for (const l of rawLinks) {
    const s = index.get(l.source)!
    const t = index.get(l.target)!
    if (seen.has(t)) continue
    seen.add(t)
    parent[t] = s
    kids[s].push(t)
  }

  // Roots: ENIAC first (the chart's trunk), then the seven later families in
  // the order the dataset lists them.
  const roots = rawNodes.map((_, i) => i).filter((i) => parent[i] === -1)

  // Leaf order from a depth-first walk; each leaf gets one angular slot. A
  // small gap separates root families so they read as separate trees.
  const order: number[] = []
  const walk = (i: number) => {
    if (kids[i].length === 0) order.push(i)
    for (const k of kids[i]) walk(k)
  }
  // Gaps are in leaf slots: a small one between root families, so they read
  // as separate trees, and a wider wedge at twelve o'clock that holds the
  // ring labels.
  const GAP = 1.5
  const WEDGE = 9
  const slots = new Map<number, number>()
  let cursor = WEDGE / 2
  roots.forEach((r, ri) => {
    if (ri > 0) cursor += GAP
    const before = order.length
    walk(r)
    for (let k = before; k < order.length; k++) slots.set(order[k], cursor++)
  })
  const total = cursor + WEDGE / 2
  const angle = new Array<number>(rawNodes.length).fill(0)
  const place = (i: number): number => {
    if (kids[i].length === 0) {
      angle[i] = ((slots.get(i)! + 0.5) / total) * Math.PI * 2
    } else {
      const a = kids[i].map(place)
      angle[i] = (Math.min(...a) + Math.max(...a)) / 2
    }
    return angle[i]
  }
  roots.forEach(place)

  const nodes: TreeNode[] = rawNodes.map((n, i) => {
    const year = n.year ? Number(n.year) : null
    const r = radiusOf(n.ring, year)
    const [x, y] = pt(angle[i], r)
    return {
      id: n.id,
      label: n.label,
      year,
      ring: n.ring,
      maker: n.maker,
      branch: n.branch,
      chart: n.layer === "original_1961",
      notes: n.notes,
      x,
      y,
      parent: parent[i],
    }
  })
  const rad = nodes.map((n) => Math.hypot(n.x, n.y))

  const primarySeen = new Set<number>()
  const links: TreeLink[] = rawLinks.map((l) => {
    const s = index.get(l.source)!
    const t = index.get(l.target)!
    const primary = !primarySeen.has(t)
    primarySeen.add(t)
    // The radial link: leave the parent along its own spoke, swing round at
    // the middle radius, arrive along the child's spoke.
    const rm = (rad[s] + rad[t]) / 2
    const [x0, y0] = [nodes[s].x, nodes[s].y]
    const [c1x, c1y] = pt(angle[s], rm)
    const [c2x, c2y] = pt(angle[t], rm)
    const [x1, y1] = [nodes[t].x, nodes[t].y]
    return {
      s,
      t,
      rel: l.relation as Relation,
      firm: l.confidence === "read",
      primary,
      d: `M${x0} ${y0}C${c1x} ${c1y} ${c2x} ${c2y} ${x1} ${y1}`,
    }
  })

  return {
    nodes,
    links,
    rings: RINGS.slice(1).map((year) => ({ year, r: RING_R[year] })),
    extent: RING_R[2030],
  }
}

let cached: ComputerTreeData | null = null
export function computerTree(): ComputerTreeData {
  return (cached ??= build())
}
