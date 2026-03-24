import foodGyro from "@/assets/food-gyro.jpg";
import foodChickenGyro from "@/assets/food-chicken-gyro.jpg";
import foodFalafel from "@/assets/food-falafel.jpg";
import foodGyroBowl from "@/assets/food-gyro-bowl.jpg";
import foodShawarmaBowl from "@/assets/food-shawarma-bowl.jpg";
import foodGyroSalad from "@/assets/food-gyro-salad.jpg";
import foodHummus from "@/assets/food-hummus.jpg";
import foodLentilSoup from "@/assets/food-lentil-soup.jpg";
import foodFries from "@/assets/food-fries.jpg";
import foodBaklava from "@/assets/food-baklava.jpg";
import foodRicePudding from "@/assets/food-rice-pudding.jpg";
import foodLambShawarma from "@/assets/food-lamb-shawarma.jpg";
import foodKofta from "@/assets/food-kofta.jpg";
import foodFalafelPlate from "@/assets/food-falafel-plate.jpg";
import foodChickenShawarmaWrap from "@/assets/food-chicken-shawarma-wrap.jpg";
import foodFattoush from "@/assets/food-fattoush.jpg";
import foodBabaGanoush from "@/assets/food-baba-ganoush.jpg";
import foodMintLemonade from "@/assets/food-mint-lemonade.jpg";
import foodTurkishTea from "@/assets/food-turkish-tea.jpg";
import foodGrapeLeaves from "@/assets/food-grape-leaves.jpg";
import foodKunafa from "@/assets/food-kunafa.jpg";
import foodFalafelSalad from "@/assets/food-falafel-salad.jpg";
import foodLoadedFries from "@/assets/food-loaded-fries.jpg";
import foodAyran from "@/assets/food-ayran.jpg";
import foodSoda from "@/assets/food-soda.jpg";

export interface ModifierOption {
  id: string;
  name: string;
  price: number;
}

export interface ModifierGroup {
  id: string;
  label: string;
  required: boolean;
  maxSelect: number; // 1 = radio-style, >1 = multi-select
  options: ModifierOption[];
}

export interface MenuItem {
  id: string;
  name: string;
  desc: string;
  price: number;
  category: string;
  image: string;
  tag?: string;
  modifiers?: ModifierGroup[];
}

// ---- Shared modifier groups (owner can reuse across items) ----

const proteinAdd: ModifierGroup = {
  id: "protein-add",
  label: "Add Protein",
  required: false,
  maxSelect: 3,
  options: [
    { id: "extra-gyro", name: "Extra Gyro Meat", price: 2.99 },
    { id: "extra-chicken", name: "Extra Chicken", price: 2.99 },
    { id: "extra-lamb", name: "Extra Lamb", price: 3.49 },
    { id: "extra-falafel", name: "Extra Falafel (3 pcs)", price: 1.99 },
  ],
};

const toppings: ModifierGroup = {
  id: "toppings",
  label: "Toppings",
  required: false,
  maxSelect: 6,
  options: [
    { id: "extra-feta", name: "Extra Feta Cheese", price: 1.00 },
    { id: "extra-hummus", name: "Extra Hummus", price: 1.00 },
    { id: "jalapenos", name: "Jalapeños", price: 0.50 },
    { id: "extra-tzatziki", name: "Extra Tzatziki", price: 0.75 },
    { id: "extra-tahini", name: "Extra Tahini", price: 0.75 },
    { id: "hot-sauce", name: "Hot Sauce", price: 0.00 },
  ],
};

const sideUpgrade: ModifierGroup = {
  id: "side-upgrade",
  label: "Upgrade Side",
  required: false,
  maxSelect: 1,
  options: [
    { id: "side-loaded-fries", name: "Loaded Fries", price: 3.00 },
    { id: "side-hummus", name: "Hummus & Pita", price: 2.00 },
    { id: "side-soup", name: "Lentil Soup", price: 1.50 },
  ],
};

const drinkSize: ModifierGroup = {
  id: "drink-size",
  label: "Size",
  required: true,
  maxSelect: 1,
  options: [
    { id: "size-regular", name: "Regular", price: 0.00 },
    { id: "size-large", name: "Large", price: 1.00 },
  ],
};

export const menuItems: MenuItem[] = [
  // Gyros & Wraps
  { id: "classic-gyro", name: "Classic Gyro", desc: "Seasoned lamb & beef, fresh veggies, tzatziki, warm pita", price: 9.99, category: "Gyros & Wraps", image: foodGyro, tag: "Signature", modifiers: [toppings, proteinAdd] },
  { id: "chicken-gyro", name: "Chicken Gyro", desc: "Grilled chicken, crisp lettuce, tomatoes, house sauce", price: 9.99, category: "Gyros & Wraps", image: foodChickenGyro, modifiers: [toppings, proteinAdd] },
  { id: "falafel-wrap", name: "Falafel Wrap", desc: "Crispy falafel, pickled turnips, tahini, fresh herbs", price: 8.99, category: "Gyros & Wraps", image: foodFalafel, modifiers: [toppings] },
  { id: "lamb-shawarma", name: "Lamb Shawarma Wrap", desc: "Slow-roasted lamb, garlic sauce, pickles, fresh herbs in warm pita", price: 11.99, category: "Gyros & Wraps", image: foodLambShawarma, tag: "Popular", modifiers: [toppings, proteinAdd] },
  { id: "chicken-shawarma-wrap", name: "Chicken Shawarma Wrap", desc: "Marinated grilled chicken, garlic sauce, pickles, lettuce in pita", price: 10.99, category: "Gyros & Wraps", image: foodChickenShawarmaWrap, modifiers: [toppings, proteinAdd] },

  // Plates
  { id: "kofta-plate", name: "Beef Kofta Plate", desc: "Seasoned beef kofta kebabs over rice with grilled vegetables and tahini", price: 14.99, category: "Plates", image: foodKofta, tag: "Chef's Pick", modifiers: [toppings, sideUpgrade] },
  { id: "falafel-plate", name: "Falafel Plate", desc: "Six crispy falafels with tahini, pickles, salad, hummus, and warm pita", price: 11.99, category: "Plates", image: foodFalafelPlate, modifiers: [toppings, sideUpgrade] },
  { id: "chicken-shawarma-plate", name: "Chicken Shawarma Plate", desc: "Grilled chicken shawarma over seasoned rice with salad and garlic sauce", price: 13.99, category: "Plates", image: foodShawarmaBowl, modifiers: [toppings, sideUpgrade] },
  { id: "lamb-shawarma-plate", name: "Lamb Shawarma Plate", desc: "Tender lamb shawarma over rice with hummus, salad, and pita", price: 15.99, category: "Plates", image: foodLambShawarma, tag: "Popular", modifiers: [toppings, sideUpgrade] },

  // Bowls
  { id: "gyro-bowl", name: "Gyro Bowl", desc: "Gyro meat over seasoned rice, salad, tzatziki, pita on the side", price: 12.99, category: "Bowls", image: foodGyroBowl, tag: "Popular", modifiers: [toppings, proteinAdd] },
  { id: "chicken-bowl", name: "Chicken Shawarma Bowl", desc: "Marinated chicken, hummus, tabbouleh, pickles over rice", price: 12.99, category: "Bowls", image: foodShawarmaBowl, modifiers: [toppings, proteinAdd] },
  { id: "falafel-bowl", name: "Falafel Bowl", desc: "Crispy falafel over rice with hummus, pickles, tahini, and fresh veggies", price: 11.99, category: "Bowls", image: foodFalafelPlate, modifiers: [toppings] },

  // Salads
  { id: "gyro-salad", name: "Gyro Salad", desc: "Mixed greens, gyro meat, feta, olives, peppers, house vinaigrette", price: 11.99, category: "Salads", image: foodGyroSalad },
  { id: "fattoush-salad", name: "Fattoush Salad", desc: "Crispy pita chips, fresh vegetables, pomegranate, sumac dressing", price: 9.99, category: "Salads", image: foodFattoush },
  { id: "falafel-salad", name: "Falafel Salad", desc: "Crispy falafel over mixed greens with chickpeas, tomatoes, tahini dressing", price: 10.99, category: "Salads", image: foodFalafelSalad },

  // Sides & Appetizers
  { id: "hummus-pita", name: "Hummus & Pita", desc: "Silky chickpea hummus with olive oil, served with two warm pitas", price: 6.99, category: "Sides", image: foodHummus, tag: "Popular" },
  { id: "baba-ganoush", name: "Baba Ganoush", desc: "Smoky roasted eggplant dip with tahini, lemon, olive oil, and warm pita", price: 7.49, category: "Sides", image: foodBabaGanoush },
  { id: "grape-leaves", name: "Stuffed Grape Leaves", desc: "Hand-rolled grape leaves stuffed with seasoned rice and herbs (6 pcs)", price: 6.99, category: "Sides", image: foodGrapeLeaves },
  { id: "lentil-soup", name: "Lentil Soup", desc: "Slow-simmered red lentils with cumin, lemon, warm spices", price: 5.49, category: "Sides", image: foodLentilSoup },
  { id: "french-fries", name: "Seasoned Fries", desc: "Crispy fries with Mediterranean spice blend", price: 4.49, category: "Sides", image: foodFries },
  { id: "loaded-fries", name: "Loaded Gyro Fries", desc: "Seasoned fries topped with gyro meat, feta cheese, and tzatziki", price: 8.99, category: "Sides", image: foodLoadedFries, tag: "Must Try" },

  // Desserts
  { id: "baklava", name: "Chocolate Baklava", desc: "Flaky phyllo, walnuts, dark chocolate, honey syrup", price: 4.99, category: "Desserts", image: foodBaklava, tag: "Must Try" },
  { id: "rice-pudding", name: "Rice Pudding", desc: "Creamy cinnamon-spiced rice pudding with pistachios", price: 4.49, category: "Desserts", image: foodRicePudding },
  { id: "kunafa", name: "Kunafa", desc: "Golden crispy phyllo with melted cheese, drizzled with sweet syrup", price: 5.99, category: "Desserts", image: foodKunafa, tag: "Popular" },

  // Drinks
  { id: "mint-lemonade", name: "Mint Lemonade", desc: "Fresh-squeezed lemonade with mint leaves over ice", price: 3.99, category: "Drinks", image: foodMintLemonade, tag: "Refreshing" },
  { id: "turkish-tea", name: "Turkish Tea", desc: "Traditional brewed Turkish tea served in a tulip glass", price: 2.49, category: "Drinks", image: foodTurkishTea },
  { id: "ayran", name: "Ayran", desc: "Chilled salted yogurt drink, refreshing and traditional", price: 2.99, category: "Drinks", image: foodAyran },
  { id: "soda", name: "Fountain Soda", desc: "Coca-Cola, Sprite, or Fanta — your choice", price: 2.49, category: "Drinks", image: foodSoda },
  { id: "water", name: "Bottled Water", desc: "Chilled bottled water", price: 1.99, category: "Drinks", image: foodMintLemonade },
];

export const categories = [...new Set(menuItems.map((i) => i.category))];
