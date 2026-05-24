import {
  LayoutDashboard,
  Briefcase,
  TrendingUp,
  Wallet,
  CheckSquare,
  Mic2,
  Users,
  MapPin,
  BarChart3,
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
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Pilotage",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, placeholder: true },
      { label: "Tâches", href: "/taches", icon: CheckSquare, placeholder: true },
    ],
  },
  {
    label: "Deals",
    items: [
      { label: "Booking", href: "/booking", icon: Briefcase, placeholder: true },
      { label: "Prod Exé", href: "/prod-executive", icon: TrendingUp, placeholder: true },
      { label: "Cachets", href: "/cachets", icon: Wallet, placeholder: true },
    ],
  },
  {
    label: "Annuaire",
    items: [
      { label: "Artistes", href: "/artistes", icon: Mic2 },
      { label: "Contacts", href: "/contacts", icon: Users },
      { label: "Lieux", href: "/lieux", icon: MapPin },
    ],
  },
  {
    label: "Outils",
    items: [
      { label: "Reporting", href: "/reporting", icon: BarChart3, placeholder: true },
      { label: "Corbeille", href: "/trash", icon: Trash2, placeholder: true },
    ],
  },
  {
    label: "Administration",
    items: [
      { label: "Paramètres", href: "/settings", icon: Settings, placeholder: true },
      { label: "Utilisateurs", href: "/settings/users", icon: Users, adminOnly: true },
    ],
  },
];
