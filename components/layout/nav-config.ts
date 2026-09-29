import {
  LayoutDashboard,
  Briefcase,
  Theater,
  Wallet,
  CheckSquare,
  Mic2,
  Users,
  MapPin,
  BarChart3,
  HandCoins,
  Settings,
  Trash2,
  type LucideIcon,
} from "lucide-react";

/**
 * Configuration centralisée de la sidebar. Source de vérité pour les items
 * de navigation, leur ordre, leur icône et leur libellé.
 *
 * `placeholder: true` = page pas encore livrée (Sprint ultérieur). On affiche
 * quand même l'item dans la sidebar avec un style un peu grisé, pour signaler
 * ce qui est à venir.
 *
 * `adminOnly: true` = item visible seulement par les ADMIN.
 */
export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  placeholder?: boolean;
  adminOnly?: boolean;
  /** Visible par le profil « Production » (Nour) — cf. lib/auth/roles.ts. */
  production?: boolean;
}

export interface NavGroup {
  label: string;
  /**
   * Si renseigné, le label du groupe devient un Link cliquable vers ce href
   * (en plus d'afficher les items en dessous). Utilisé pour les groupes qui
   * ont une page parent — ex. "Deals" → /deals (3 cards récap).
   */
  href?: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Pilotage",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { label: "Tâches", href: "/taches", icon: CheckSquare, production: true },
    ],
  },
  {
    label: "Deals",
    href: "/deals", // page parent avec 3 cards récap (Booking / Prod Exé / Cachet)
    items: [
      { label: "Booking", href: "/deals/booking", icon: Briefcase },
      { label: "Productions", href: "/shows", icon: Theater, production: true },
      { label: "Cachets", href: "/deals/cachets", icon: Wallet },
      { label: "Management fees", href: "/deals/management-fees", icon: HandCoins, production: true },
    ],
  },
  {
    label: "Annuaire",
    items: [
      { label: "Artistes", href: "/artistes", icon: Mic2, production: true },
      { label: "Contacts", href: "/contacts", icon: Users, production: true },
      { label: "Lieux", href: "/lieux", icon: MapPin, production: true },
    ],
  },
  {
    label: "Outils",
    items: [
      { label: "Reporting", href: "/reporting", icon: BarChart3 },
      { label: "Corbeille", href: "/trash", icon: Trash2 },
    ],
  },
  {
    label: "Administration",
    items: [
      { label: "Paramètres", href: "/settings", icon: Settings },
      { label: "Utilisateurs", href: "/settings/users", icon: Users, adminOnly: true },
    ],
  },
];
