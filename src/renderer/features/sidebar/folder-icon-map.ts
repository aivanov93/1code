import {
  Folder, Inbox, Archive, FileText, Clipboard, LayoutGrid, List, Hash,
  Circle, CheckCircle, Clock, Timer, Hourglass, AlertCircle, PauseCircle, PlayCircle,
  Star, Heart, Flag, Bookmark, Zap, Flame, Target, Trophy,
  Code, Terminal, GitBranch, Bug, Package, Layers, Database, Cpu,
  Pen, PenLine, PenTool, Pencil, PencilLine, PencilRuler, NotebookPen, SquarePen,
  Rocket, Shield, Lock, Eye, Lightbulb, Compass, Globe, Music,
} from "lucide-react"
import type { ComponentType } from "react"

type IconComponent = ComponentType<{ className?: string; style?: React.CSSProperties }>

// Curated set of icons available for folders. Covers all FOLDER_ICON_SECTIONS
// in manage-folders-dialog.tsx. Users who pick an icon outside this set via
// the full search will see the Folder fallback in the sidebar (acceptable
// trade-off vs importing all 1,500+ icons).
const FOLDER_ICON_MAP: Record<string, IconComponent> = {
  // General
  folder: Folder, inbox: Inbox, archive: Archive, "file-text": FileText,
  clipboard: Clipboard, "layout-grid": LayoutGrid, list: List, hash: Hash,
  // Status
  circle: Circle, "check-circle": CheckCircle, clock: Clock, timer: Timer,
  hourglass: Hourglass, "alert-circle": AlertCircle, "pause-circle": PauseCircle, "play-circle": PlayCircle,
  // Priority
  star: Star, heart: Heart, flag: Flag, bookmark: Bookmark,
  zap: Zap, flame: Flame, target: Target, trophy: Trophy,
  // Dev
  code: Code, terminal: Terminal, "git-branch": GitBranch, bug: Bug,
  package: Package, layers: Layers, database: Database, cpu: Cpu,
  // Writing
  pen: Pen, "pen-line": PenLine, "pen-tool": PenTool, pencil: Pencil,
  "pencil-line": PencilLine, "pencil-ruler": PencilRuler, "notebook-pen": NotebookPen, "square-pen": SquarePen,
  // Misc
  rocket: Rocket, shield: Shield, lock: Lock, eye: Eye,
  lightbulb: Lightbulb, compass: Compass, globe: Globe, music: Music,
}

export function getFolderIcon(iconName: string): IconComponent {
  return FOLDER_ICON_MAP[iconName] || Folder
}
