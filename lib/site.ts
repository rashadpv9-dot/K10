// Site content. Today this is static; the admin panel will move it into the database.

const UPLOADS = "https://kingston10bh.com/wp-content/uploads/2026/05";
export const img = (file: string) => `${UPLOADS}/${file}`;

export const LOGO =
  "https://kingston10bh.com/wp-content/uploads/elementor/thumbs/Logo-New-rmv8u24ew0rc5l41v5ei2bwntofqbs4wfegtkh6ku8.png";

export const site = {
  name: "Kingston 10",
  url: "https://kingston10bh.com",
  phone: "+973 3437 3567",
  phoneHref: "tel:+97334373567",
  email: "reservations@kingston10bh.com",
  addressLine: "Block 338, Adliya",
  city: "Manama",
  country: "Bahrain",
  hours: "12:00 PM – 2:00 AM",
  maps: "https://www.google.com/maps/search/?api=1&query=Kingston+10+Block+338+Adliya+Manama",
  instagram: "https://www.instagram.com/kingston10bh/",
  facebook: "https://web.facebook.com/profile.php?id=61575762135591",
};

export const ticker = [
  "Reggae Brunch Fest · Fridays 3 PM – 7 PM",
  "One Love Thursdays · Live DJs",
  "Sunday Service · Afro Grill & Music from 1 PM",
  "Open daily 12 PM – 2 AM",
  "Block 338 · Adliya",
];

export type Plate = { name: string; tag: string; note: string; price: string; image: string; bg: string };

export const plates: Plate[] = [
  { name: "Jerk Chicken", tag: "Signature", note: "Marinated 24 hours, smoked low and slow.", price: "9", image: "Jerk-Chicken-sss.png", bg: "#0e7c7b" },
  { name: "Curry Goat", tag: "Island favourite", note: "Tender goat in rich Jamaican curry.", price: "11", image: "Curry-Goats.png", bg: "#0f4a30" },
  { name: "Peppered Shrimp", tag: "Fire & spice", note: "Spicy sautéed shrimp, Caribbean seasoning.", price: "6", image: "Peppered-Shrimp-1.png", bg: "#b3231b" },
  { name: "Oxtail & Bean", tag: "Slow-braised", note: "Fall-off-the-bone oxtail with butter beans.", price: "14", image: "Oxtail-and-Bean.png", bg: "#15110d" },
  { name: "Wings", tag: "To start", note: "Jerk, honey garlic or sweet & spicy BBQ.", price: "8", image: "chicken-wings.png", bg: "#8f1d17" },
  { name: "Shrimp Tostones", tag: "Street food", note: "Fried plantain rounds, seasoned shrimp.", price: "4", image: "Shrimp-Tostones.png", bg: "#0b2e1f" },
];

export type Night = { title: string; kind: string; day: string; time: string; image: string; alt: string; soon?: boolean };

export const nights: Night[] = [
  { title: "One Love Thursdays", kind: "Live DJs", day: "Thursday", time: "Evening", image: "3-1024x687.jpg", alt: "The Kingston 10 dining room, full on a weeknight" },
  { title: "Reggae Brunch Fest", kind: "Brunch · Reggae", day: "Friday", time: "3 – 7 PM", image: "cc.png", alt: "Guests at the Reggae Brunch Fest" },
  { title: "Games & Giggles", kind: "Games · Comedy", day: "Saturday", time: "6 PM – late", image: "ffff.png", alt: "Friends laughing over drinks", soon: true },
  { title: "Sunday Service", kind: "Afro Grill & Music", day: "Sunday", time: "1 PM – late", image: "Hero2.png", alt: "Meat skewers on the grill" },
];

export type Dish = { name: string; desc: string; price: string; image?: string };
export type Course = { id: string; eyebrow: string; title: string; dishes: Dish[] };

export const menu: Course[] = [
  {
    id: "starters",
    eyebrow: "To begin",
    title: "Starters",
    dishes: [
      { name: "Wings (8 pcs)", desc: "Jerk / Honey Garlic / Sweet & Spicy BBQ", price: "8", image: "chicken-wings.png" },
      { name: "Shrimp Tostones", desc: "Fried plantain rounds topped with seasoned shrimp", price: "4", image: "Shrimp-Tostones.png" },
    ],
  },
  {
    id: "salads",
    eyebrow: "Fresh",
    title: "Salads",
    dishes: [
      { name: "Tropical Salad", desc: "Mixed greens with mango or pineapple", price: "3" },
      { name: "Caribbean Garden", desc: "Fresh vegetables with a light island dressing", price: "3" },
    ],
  },
  {
    id: "mains",
    eyebrow: "Island classics",
    title: "Mains",
    dishes: [
      { name: "Oxtail and Bean", desc: "Slow-braised oxtail with butter beans", price: "14", image: "Oxtail-and-Bean.png" },
      { name: "Escovitch Fish", desc: "Crispy fish topped with pickled vegetables", price: "13" },
      { name: "Jerk Chicken", desc: "Grilled chicken with signature jerk spices", price: "9", image: "Jerk-Chicken-sss.png" },
      { name: "Peppered Shrimp", desc: "Spicy sautéed shrimp with Caribbean seasoning", price: "6", image: "Peppered-Shrimp-1.png" },
      { name: "Curry Goat", desc: "Tender goat in rich Jamaican curry", price: "11", image: "Curry-Goats.png" },
    ],
  },
  {
    id: "sides",
    eyebrow: "On the side",
    title: "Sides",
    dishes: [
      { name: "Rice and Peas", desc: "Coconut rice with red beans", price: "3.5" },
      { name: "Sweet Plantains", desc: "Caramelized ripe plantains", price: "2" },
      { name: "Fried Dumplings", desc: "Crispy outside, soft inside", price: "3.5" },
      { name: "White Rice", desc: "Steamed fluffy rice", price: "2" },
      { name: "Mac and Cheese", desc: "Creamy baked macaroni", price: "3.5" },
    ],
  },
  {
    id: "sweet",
    eyebrow: "To finish",
    title: "Desserts & drinks",
    dishes: [
      { name: "Jamaican Fruit Cake", desc: "Rich spiced cake with dried fruits", price: "5" },
      { name: "Pineapple Upside-Down Cake", desc: "Soft cake with caramelized pineapple", price: "4.5" },
      { name: "Jamaican Rum Punch", desc: "Classic Caribbean fruit punch with rum", price: "6" },
    ],
  },
];
