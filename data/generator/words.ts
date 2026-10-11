/**
 * Word lists for fictional parties and goods. Names are built from these, not
 * from faker's company and city lists, so every party and place is invented
 * (synthetic data only; CLAUDE.md). Person names come from faker.
 */

/** First word of company, city and bank names. */
export const PLACE_WORDS = [
  "Alder",
  "Birchbank",
  "Bluewater",
  "Cedarvale",
  "Copperleaf",
  "Driftwood",
  "Fernhollow",
  "Granite Bay",
  "Heronmoor",
  "Ironwood",
  "Juniper",
  "Kestrel",
  "Lanternfield",
  "Larchmont",
  "Marrowind",
  "Northwind",
  "Osprey",
  "Pinecrest",
  "Quarryside",
  "Riverbend",
  "Saltmarsh",
  "Shoalwater",
  "Sprucewood",
  "Thistledown",
  "Tidewater",
  "Willowbrook",
] as const;

export const CITY_SUFFIXES = [
  "Bay",
  "Crossing",
  "Falls",
  "Harbour",
  "Junction",
  "Landing",
  "Mills",
  "Point",
  "Ridge",
] as const;

export const STREET_TYPES = [
  "Road",
  "Street",
  "Avenue",
  "Drive",
  "Lane",
  "Crescent",
  "Way",
] as const;

export const LEGAL_FORMS = ["Inc.", "Ltd.", "Corp.", "Limited", "Inc"] as const;

export const BANK_KINDS = ["Credit Union", "Mutual Bank", "Savings & Trust"];

export const SHIP_TO_SITES = [
  "Plant 2",
  "Warehouse",
  "DC",
  "Receiving",
  "Site Office",
] as const;

export const CUSTOMER_TRADES = [
  "Provisions",
  "Medical Devices",
  "Fabrication",
  "Construction",
  "Dental Group",
  "Brewing",
  "Logistics",
  "Property Management",
  "Veterinary Clinic",
  "Marine Services",
  "Bakery",
  "Engineering",
] as const;

export type CatalogueItem = {
  description: string;
  /** Unit price range in whole dollars. */
  price: readonly [number, number];
  /** Quantity range. */
  qty: readonly [number, number];
};

/** A vendor's trade and what it sells. Descriptions stay short so a PDF row fits on one line. */
export type Trade = {
  name: string;
  sku: string;
  items: readonly CatalogueItem[];
};

export const TRADES: readonly Trade[] = [
  {
    name: "Industrial Supply",
    sku: "IS",
    items: [
      {
        description: "Hex bolt M10 x 50mm, zinc (box of 100)",
        price: [20, 60],
        qty: [1, 20],
      },
      {
        description: "Flat washer M10, zinc (box of 250)",
        price: [10, 30],
        qty: [1, 20],
      },
      {
        description: "Wedge anchor 3/8 in. (box of 50)",
        price: [40, 90],
        qty: [1, 10],
      },
      {
        description: "Safety glasses, clear (pack of 12)",
        price: [15, 45],
        qty: [1, 10],
      },
      {
        description: "On-site inventory count",
        price: [150, 400],
        qty: [1, 2],
      },
    ],
  },
  {
    name: "Packaging Distributors",
    sku: "PK",
    items: [
      {
        description: "Corrugated box 12x10x8 kraft (bundle)",
        price: [15, 30],
        qty: [5, 60],
      },
      {
        description: "Packing tape 48mm x 110m clear (case)",
        price: [40, 70],
        qty: [1, 12],
      },
      {
        description: "Stretch film 18 in. 80ga (case)",
        price: [70, 110],
        qty: [1, 10],
      },
      {
        description: "Direct thermal label 4x6 (roll)",
        price: [8, 15],
        qty: [5, 40],
      },
      {
        description: "Pallet 48x40, heat treated",
        price: [12, 25],
        qty: [2, 20],
      },
    ],
  },
  {
    name: "Translation Services",
    sku: "TR",
    items: [
      {
        description: "Translation EN to FR (per 100 words)",
        price: [12, 18],
        qty: [10, 150],
      },
      { description: "Proofreading (hour)", price: [60, 95], qty: [1, 12] },
      {
        description: "Desktop publishing (hour)",
        price: [55, 85],
        qty: [1, 10],
      },
      {
        description: "Terminology glossary setup",
        price: [200, 450],
        qty: [1, 1],
      },
    ],
  },
  {
    name: "Electrical Contractors",
    sku: "EL",
    items: [
      {
        description: "Electrician labour (hour)",
        price: [85, 125],
        qty: [2, 40],
      },
      { description: "LED panel light 2x4 ft", price: [60, 140], qty: [1, 24] },
      {
        description: "20A breaker, single pole",
        price: [12, 35],
        qty: [1, 12],
      },
      { description: "Service call", price: [90, 160], qty: [1, 1] },
    ],
  },
  {
    name: "Office Products",
    sku: "OP",
    items: [
      {
        description: "Copy paper, letter (case of 10 reams)",
        price: [45, 70],
        qty: [1, 20],
      },
      { description: "Toner cartridge, black", price: [80, 190], qty: [1, 8] },
      { description: "Ergonomic task chair", price: [180, 420], qty: [1, 6] },
      {
        description: "Desk delivery and assembly",
        price: [60, 150],
        qty: [1, 3],
      },
    ],
  },
  {
    name: "Analytics",
    sku: "AN",
    items: [
      {
        description: "Data pipeline consulting (hour)",
        price: [120, 190],
        qty: [4, 60],
      },
      {
        description: "Dashboard licence (monthly)",
        price: [250, 900],
        qty: [1, 3],
      },
      {
        description: "Quarterly reporting package",
        price: [800, 2500],
        qty: [1, 1],
      },
    ],
  },
  {
    name: "Janitorial Services",
    sku: "JS",
    items: [
      {
        description: "Nightly office cleaning (month)",
        price: [900, 2400],
        qty: [1, 1],
      },
      {
        description: "Carpet extraction (sq ft x 100)",
        price: [18, 30],
        qty: [5, 40],
      },
      {
        description: "Window washing, exterior",
        price: [250, 700],
        qty: [1, 2],
      },
      {
        description: "Washroom supplies restock",
        price: [40, 120],
        qty: [1, 4],
      },
    ],
  },
  {
    name: "Printing",
    sku: "PR",
    items: [
      {
        description: "Business cards, 2-sided (box of 500)",
        price: [35, 70],
        qty: [1, 10],
      },
      {
        description: "Tri-fold brochure, gloss (per 100)",
        price: [60, 140],
        qty: [1, 20],
      },
      { description: "Vinyl banner 3x8 ft", price: [90, 220], qty: [1, 4] },
      { description: "Graphic design (hour)", price: [65, 110], qty: [1, 8] },
    ],
  },
];
