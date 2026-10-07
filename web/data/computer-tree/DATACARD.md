# Data Card: The Computer Tree, 1945–2025

A node-edge lineage graph of computers and processors. It starts from the 1961 US Army "Computer Tree" chart (ENIAC to 1960) and extends it decade by decade to 2025.

| | |
|---|---|
| **Version** | 1.0 (2026-10-05) |
| **Nodes** | 542 machines, processors and systems |
| **Edges** | 614 directed lineage links (parent → child) |
| **Time span** | 1945 (ENIAC) to 2025 |
| **Files** | `nodes.csv`, `edges.csv`, `computer_tree.json`, `DATACARD.md` |
| **Graph type** | Directed acyclic graph (DAG); 69 nodes have more than one parent |
| **Author** | Bradley Isenbek, compiled with Claude |

---

## 1. Sources and how the dataset was built

The dataset has two layers, marked in the `layer` field on every node and edge.

| Layer | Nodes | Coverage | Source |
|---|---|---|---|
| `original_1961` | 207 | 1945–1960 | Hand transcription of the 1961 US Army "Computer Tree" chart. The chart is a radial tree with ENIAC at the trunk and rings at 1950, 1955 and 1960. |
| `extension` | 335 | 1960–2025 | Added lineages for later decades, compiled from general knowledge of computing history. No single external source; see Limitations. |

**Transcribing the 1961 chart.** The source was a low-resolution scan. Most labels are legible, but many branch attachments in dense areas are hard to trace. Each edge records how sure the transcription is (`confidence`). A few labels that could not be read at all were left out. Where the chart's placement differs from standard histories (for example, SAGE / AN/FSQ-7 hangs off the central military limb rather than off Whirlwind), the dataset **follows the chart**.

**Extending past 1960.** One ring per decade (1970, 1980, …, 2030). Each extension follows major lineages forward and records cross-family links, such as shared CPUs, compatibility, and design teams that moved between companies. The 2030 ring is an open decade and currently holds machines from 2021 to 2025.

## 2. Schema

### `nodes.csv`

| Column | Type | Description |
|---|---|---|
| `id` | string | Unique slug derived from the label (e.g. `ibm_system_360`). Primary key. |
| `label` | string | Machine name. Labels from the 1961 chart keep its uppercase spelling (`BUR 220`, `NATIONAL 304`). |
| `year` | int / empty | First delivery or introduction year. **Empty for 109 nodes** where the chart gives no date (all in the 1961 layer). |
| `ring` | int | The ring the node falls inside: the node dates from on or before this year and after the previous ring. Values: 1945, 1950, 1955, 1960, 1970, 1980, 1990, 2000, 2010, 2020, 2030. For undated 1961-chart nodes, this comes from the node's position on the chart. |
| `maker` | string | Builder or organization (`?` where the chart does not say). 147 distinct values. |
| `branch` | string | Grouping label: the limb of the original chart (e.g. `Left - Monrobot line`) or the extension family (e.g. `CDC / Cray`, `Mobile`, `AI accelerators`). 56 distinct values. |
| `layer` | enum | `original_1961` or `extension`. |
| `is_root` | bool | `true` for nodes with no parent (see §4). |
| `notes` | string | Short context: what made the machine notable, or why a link exists. |

### `edges.csv`

| Column | Type | Description |
|---|---|---|
| `source` | id | Parent node. |
| `target` | id | Child node. |
| `relation` | enum | What kind of lineage (see below). |
| `layer` | enum | Layer of the target node. |
| `confidence` | enum | `read`: the link is clearly visible on the chart or well established historically. `approx`: the link was estimated (see below). |

**The first edge listed for each target is its primary parent.** The tree layout uses it, and so does "trace back to ENIAC". Any further edges for the same target are secondary parents.

### `relation` values

| Value | Count | Meaning |
|---|---|---|
| `successor` | 390 | Next model in the same product line or team. |
| `derived` | 152 | Built from, copied from, or spun off a parent design, often by a different organization. |
| `uses_cpu` | 36 | A system built around a processor that has its own node (e.g. Summit uses POWER9 and V100). |
| `influence` | 22 | A design idea or people moved across, without direct design reuse (e.g. Xerox Alto → Apple Lisa). |
| `compatible` | 14 | Runs the parent's instruction set or software (e.g. Amdahl 470V/6 → IBM System/370). |

### `computer_tree.json`

The same data in a shape D3 and other graph tools load directly:
`{ "nodes": [ {…node row…} ], "links": [ {…edge row…} ] }`. Fields match the CSVs.

## 3. Distribution

**Nodes by ring**

| Ring | 1945 | 1950 | 1955 | 1960 | 1970 | 1980 | 1990 | 2000 | 2010 | 2020 | 2030* |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Nodes | 1 | 3 | 42 | 161 | 51 | 47 | 46 | 39 | 45 | 62 | 45 |

\*The 2030 ring is open and covers 2021–2025. The 1960 ring includes a handful of machines the 1961 chart showed as planned (e.g. CDC 6600, UNIVAC III).

**Edge confidence by layer**

| Layer | `read` | `approx` | Share approx |
|---|---|---|---|
| `original_1961` | 43 | 163 | 79% |
| `extension` | 363 | 45 | 11% |

## 4. Graph structure

- **Acyclic and date-consistent.** The build script checks that every parent id exists, that the graph has no cycles, and that no parent is dated more than one year after its child.
- **Eight roots.** ENIAC is the root of the original chart. The extension adds seven roots for families that do not descend from anything on the 1961 chart: HP 2116A, Datapoint 2200, Intel 4004, ATI Radeon, NVIDIA GeForce 256, Google TPU v1 and Sunway TaihuLight.
- **ENIAC reaches 458 of 542 nodes** through some path.
- **Longest lineage (26 generations):** ENIAC → EDVAC → SEAC → FLAC → MELLON → CIRCLE → PENNSTAC → READIX → PACKBELL 250 → SDS 910 → … → SDS 940 → BCC 500 → Xerox Alto → Sun-1 → … → SPARC Enterprise M9000 → K computer → Fujitsu A64FX → Fugaku. The first seven steps run through `approx` edges on the 1961 chart.
- **Largest hubs (out-degree):** LOGISTICS 13, RASTAC 12, IAS 10, FLAC 9, ARM Cortex-A57 9. **The 1961-layer hubs (LOGISTICS, RASTAC, FLAC, READIX) are partly a transcription artifact.** Unclear small branches were attached to the nearest legible limb node, which concentrates children on those nodes. IAS and ARM Cortex-A57 are genuine hubs.
- **Convergence in recent decades.** Most multi-parent nodes are after 2000. They show long-running lines merging onto shared processors, e.g. Unisys ClearPath Forward (Univac 1100 + Burroughs + Intel), Frontier (HPE Cray EX + AMD EPYC + AMD Instinct), and NVIDIA GH200 (Hopper + Arm-based Grace).

## 5. Known limitations

1. **The 1961 chart's branch structure is approximate.** 79% of its edges are `approx`. Treat attachments of minor 1950s machines as "same region of the chart" rather than proven ancestry. Major lines such as IAS → IBM 701 → 704 → 709 → 7090 and ERA/UNIVAC 1101 → 1103 are `read`.
2. **One change from the chart.** UNIVAC 1101 (ERA Atlas, 1950) is attached directly to ENIAC, and LOGISTICS (1953) under it. This avoids a parent dated after its child.
3. **109 undated nodes.** All are from the 1961 chart and many are obscure; the `ring` field still places them within a five-year band.
4. **Coverage is selective after 1960.** The extension follows major lineages and notable machines; it is not a full product catalog. Gaps include: Soviet and Eastern Bloc computers, most Japanese mainframes, SGI and MIPS workstations, the Amiga and Atari, game consoles before the PS3, embedded and microcontroller lines (other than the Raspberry Pi Pico), and quantum computers (left out because they have no real lineage to anything in the tree).
5. **Architecture families are compressed.** For example, Arm's 64-bit server cores (Neoverse N1/N2/V2) are linked through the `ARM Cortex-A57` node as "Arm 64-bit" rather than listed core by core. These links are `compatible`/`approx`.
6. **No external citations per row.** Extension facts come from general knowledge of computing history, not from a cited source per row. Dates are introduction or first-delivery years and may differ by a year from other references.
7. **Current to mid-2026 knowledge.** Systems announced in 2026 (e.g. NVIDIA Rubin) are not included.
8. **Subjective judgments.** The choice between `successor`, `derived` and `influence`, and which parent counts as primary, are judgment calls.

## 6. Suggested uses

- Graph analysis: centrality, lineage depth, how families converge over time.
- Visualizations: radial or dendrogram trees, force-directed graphs, timelines.
- Teaching and exploring computing history; tracing any modern system back to its ancestors.

**Not suitable for:** citing exact dates or ancestry of individual 1950s machines without checking them against a primary source.

## 7. Extending the dataset

The build script defines each node as one pipe-delimited row:

```
label | parent(s) ; separated, primary first | year | ring | maker | branch | relation | confidence | note
```

To add a decade, add rows with the next `ring` value and rebuild. The build checks for missing parents, cycles and date order. New second parents on existing nodes are added by editing that node's parent field.

## 8. Changelog

| Version | Change |
|---|---|
| 0.1 | 1961 chart transcribed; extended to 1970, 1980, 1990 (349 nodes) |
| 0.2 | 2000 ring; rings made data-driven (387 nodes) |
| 0.3 | 2010 ring: mobile, GPU and cloud families (433 nodes) |
| 0.4 | 2020 ring; Berkeley RISC I added as a cross-link to SPARC and ARM (495 nodes) |
| 1.0 | 2030 ring (2021–2025, open); ATI Radeon root added; this data card (542 nodes, 614 edges) |
