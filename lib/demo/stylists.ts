import { rng } from "./rng";

export type Stylist = {
  id: string;
  name: string;
  handle: string;
  role: "Owner" | "Stylist" | "Color Specialist" | "Barber" | "Esthetician";
  chair: string;
  rentDue: number;
  bookingSystem: "Vagaro" | "Millennium" | "Square" | "Manual";
  initials: string;
  hueDeg: number;
};

const ROSTER: Omit<Stylist, "hueDeg" | "initials">[] = [
  { id: "belinda",  name: "Belinda Reyes",   handle: "@belinda.hair",     role: "Owner",            chair: "Suite 1", rentDue: 0,   bookingSystem: "Vagaro"    },
  { id: "melissa",  name: "Melissa Tran",    handle: "@melissa.colors",   role: "Color Specialist", chair: "Suite 2", rentDue: 325, bookingSystem: "Vagaro"    },
  { id: "joe-r",    name: "Joe Reyes",       handle: "@joereyes.cuts",    role: "Barber",           chair: "Chair 1", rentDue: 275, bookingSystem: "Square"    },
  { id: "nadia",    name: "Nadia Park",      handle: "@nadia.extensions", role: "Stylist",          chair: "Suite 3", rentDue: 325, bookingSystem: "Vagaro"    },
  { id: "ari",      name: "Ari Delgado",     handle: "@ari.balayage",     role: "Color Specialist", chair: "Suite 4", rentDue: 325, bookingSystem: "Millennium"},
  { id: "sam",      name: "Sam Whitfield",   handle: "@sam.skinandbrow",  role: "Esthetician",      chair: "Room A",  rentDue: 300, bookingSystem: "Square"    },
  { id: "jules",    name: "Jules Okafor",    handle: "@jules.curls",      role: "Stylist",          chair: "Chair 2", rentDue: 275, bookingSystem: "Vagaro"    },
  { id: "rita",     name: "Rita Solano",     handle: "@rita.bridal",      role: "Stylist",          chair: "Chair 3", rentDue: 275, bookingSystem: "Manual"    },
  { id: "tomas",    name: "Tomas Whyte",     handle: "@tomas.fades",      role: "Barber",           chair: "Chair 4", rentDue: 275, bookingSystem: "Square"    },
  { id: "kenji",    name: "Kenji Park",      handle: "@kenji.menscuts",   role: "Barber",           chair: "Chair 5", rentDue: 275, bookingSystem: "Vagaro"    },
  { id: "imani",    name: "Imani Brooks",    handle: "@imani.naturals",   role: "Stylist",          chair: "Suite 5", rentDue: 325, bookingSystem: "Vagaro"    },
  { id: "priya",    name: "Priya Anand",     handle: "@priya.threading",  role: "Esthetician",      chair: "Room B",  rentDue: 300, bookingSystem: "Millennium"},
];

export const stylists: Stylist[] = ROSTER.map((s, i) => {
  const r = rng(i * 9301 + 49297);
  return {
    ...s,
    initials: s.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase(),
    hueDeg: Math.floor(r() * 360),
  };
});

export function findStylist(id: string): Stylist | undefined {
  return stylists.find(s => s.id === id);
}

export const OWNER_ID = "belinda";
