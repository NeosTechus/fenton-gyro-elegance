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
import foodDonerGyro from "@/assets/food-doner-gyro.jpg";
import foodBurritoGyro from "@/assets/food-burrito-gyro.jpg";
import foodPhillyGyro from "@/assets/food-philly-gyro.jpg";
import foodButteredChicken from "@/assets/food-buttered-chicken.jpg";
import foodSpinachPie from "@/assets/food-spinach-pie.jpg";
import foodRiceBalls from "@/assets/food-rice-balls.jpg";
import foodGyroPizza from "@/assets/food-gyro-pizza.jpg";
import foodPitaPizza from "@/assets/food-pita-pizza.jpg";
import foodChickenTenders from "@/assets/food-chicken-tenders.jpg";
import foodTiramisu from "@/assets/food-tiramisu.jpg";
import foodChocolateCake from "@/assets/food-chocolate-cake.jpg";
import foodCookies from "@/assets/food-cookies.jpg";
import foodGreekSub from "@/assets/food-greek-sub.jpg";
import foodAlGyro from "@/assets/food-al-gyro.jpg";
import foodKidsMeal from "@/assets/food-kids-meal.jpg";
import foodMedSalad from "@/assets/food-med-salad.jpg";
import foodGingerBeer from "@/assets/food-ginger-beer.jpg";
import foodTzatziki from "@/assets/food-tzatziki.jpg";
import foodPitaBread from "@/assets/food-pita-bread.jpg";
import foodRice from "@/assets/food-rice.jpg";
import foodChips from "@/assets/food-chips.jpg";
import foodCheeseFries from "@/assets/food-cheese-fries.jpg";
import foodGreekFries from "@/assets/food-greek-fries.jpg";
import foodStackedFries from "@/assets/food-stacked-fries.jpg";

export interface ModifierOption {
  id: string;
  name: string;
  price: number;
}

export interface ModifierGroup {
  id: string;
  label: string;
  required: boolean;
  maxSelect: number;
  options: ModifierOption[];
}

// FDA top-9 allergens plus "gluten" as a common colloquial label (same as wheat)
export type Allergen =
  | "wheat"
  | "dairy"
  | "eggs"
  | "sesame"
  | "tree-nuts"
  | "peanuts"
  | "soy"
  | "fish"
  | "shellfish";

export const ALLERGEN_LABEL: Record<Allergen, string> = {
  wheat: "Wheat/Gluten",
  dairy: "Dairy",
  eggs: "Eggs",
  sesame: "Sesame",
  "tree-nuts": "Tree Nuts",
  peanuts: "Peanuts",
  soy: "Soy",
  fish: "Fish",
  shellfish: "Shellfish",
};

export interface MenuItem {
  id: string;
  name: string;
  desc: string;
  price: number;
  category: string;
  image?: string;
  tag?: string;
  modifiers?: ModifierGroup[];
  allergens?: Allergen[];
  vegetarian?: boolean;
  posOnly?: boolean;
}

// ── Shared modifiers ─────────────────────────────────────────────────────

const doubleMeat: ModifierGroup = {
  id: "double-meat",
  label: "Extra Meat",
  required: false,
  maxSelect: 1,
  options: [
    { id: "double", name: "Double the Meat", price: 4.99 },
  ],
};

const toppings: ModifierGroup = {
  id: "toppings",
  label: "Toppings",
  required: false,
  maxSelect: 10,
  options: [
    { id: "extra-feta", name: "Extra Feta Cheese", price: 0.89 },
    { id: "extra-tzatziki", name: "Extra Tzatziki", price: 0.89 },
    { id: "extra-hummus", name: "Extra Hummus", price: 0.89 },
    { id: "extra-tahini", name: "Extra Tahini", price: 0.89 },
    { id: "jalapenos", name: "Jalapeños", price: 0.50 },
    { id: "extra-onions", name: "Extra Onions", price: 0.00 },
    { id: "extra-tomatoes", name: "Extra Tomatoes", price: 0.00 },
    { id: "extra-cucumbers", name: "Extra Cucumbers", price: 0.00 },
    { id: "extra-lettuce", name: "Extra Lettuce", price: 0.00 },
    { id: "hot-sauce", name: "Hot Sauce", price: 0.00 },
  ],
};

const removeIngredients: ModifierGroup = {
  id: "remove",
  label: "Remove (Allergies / Preferences)",
  required: false,
  maxSelect: 10,
  options: [
    { id: "no-onions", name: "No Onions", price: 0.00 },
    { id: "no-tomatoes", name: "No Tomatoes", price: 0.00 },
    { id: "no-lettuce", name: "No Lettuce", price: 0.00 },
    { id: "no-cucumbers", name: "No Cucumbers", price: 0.00 },
    { id: "no-feta", name: "No Feta Cheese", price: 0.00 },
    { id: "no-tzatziki", name: "No Tzatziki", price: 0.00 },
    { id: "no-peppers", name: "No Peppers", price: 0.00 },
    { id: "no-olives", name: "No Olives", price: 0.00 },
    { id: "no-sauce", name: "No Sauce", price: 0.00 },
    { id: "no-dairy", name: "No Dairy (Allergy)", price: 0.00 },
    { id: "no-gluten", name: "Gluten Free Request", price: 0.00 },
  ],
};

const makeItCombo: ModifierGroup = {
  id: "combo",
  label: "Make it a Combo",
  required: false,
  maxSelect: 1,
  options: [
    { id: "combo-fries-drink", name: "Add Fries/Tots + Fountain Drink", price: 4.99 },
  ],
};

const makeItMeal: ModifierGroup = {
  id: "meal",
  label: "Make it a Meal",
  required: false,
  maxSelect: 1,
  options: [
    { id: "meal-upgrade", name: "Add Fries/Tots + Drink", price: 4.99 },
  ],
};

const friesOrTots: ModifierGroup = {
  id: "fries-tots",
  label: "Choose Style",
  required: true,
  maxSelect: 1,
  options: [
    { id: "fries", name: "French Fries", price: 0.00 },
    { id: "tots", name: "Tater Tots", price: 0.00 },
  ],
};

const drinkChoice: ModifierGroup = {
  id: "drink-choice",
  label: "Choose Drink",
  required: false,
  maxSelect: 1,
  options: [
    { id: "fountain", name: "Fountain Drink", price: 0.00 },
    { id: "bottled-soda", name: "Bottled Soda", price: 1.00 },
    { id: "ginger-beer", name: "Ginger Beer", price: 1.00 },
  ],
};

// ── Menu Items (matching Fenton Gyro PDF menu) ───────────────────────────

export const menuItems: MenuItem[] = [

  // ── GYROS ────────────────────────────────────────────────────────────
  { id: "chicken-gyro", name: "Chicken Gyro", desc: "Grilled chicken, feta cheese crumbles, lettuce, tomatoes, red onions & housemade tzatziki sauce", price: 10.99, category: "Gyros", image: foodChickenGyro, tag: "Popular", modifiers: [toppings, removeIngredients, doubleMeat, makeItCombo], allergens: ["wheat", "dairy"] },
  { id: "traditional-gyro", name: "Traditional Gyro", desc: "Gyro slices, lettuce, tomatoes, red onions, feta cheese crumbles & housemade tzatziki sauce on pita bread", price: 10.99, category: "Gyros", image: foodGyro, tag: "Signature", modifiers: [toppings, removeIngredients, doubleMeat, makeItCombo], allergens: ["wheat", "dairy"] },
  { id: "doner-gyro", name: "Döner Gyro", desc: "Gyro slices, lettuce, tomatoes, red onions & feta cheese crumbles on lepina bread", price: 12.99, category: "Gyros", image: foodDonerGyro, modifiers: [toppings, removeIngredients, doubleMeat, makeItCombo], allergens: ["wheat", "dairy"] },
  { id: "falafel-gyro", name: "Falafel Gyro", desc: "Falafel fritters, lettuce, tomatoes, onions, cucumber & housemade tzatziki sauce", price: 10.99, category: "Gyros", image: foodFalafel, modifiers: [toppings, removeIngredients, makeItCombo], allergens: ["wheat", "dairy"], vegetarian: true },
  { id: "greek-sub", name: "Greek Sub/Gyro", desc: "Gyro slices or grilled chicken, lettuce, tomatoes, red onion & feta cheese on french bread", price: 10.99, category: "Gyros", image: foodGreekSub, modifiers: [toppings, removeIngredients, doubleMeat, makeItCombo], allergens: ["wheat", "dairy"] },
  { id: "burrito-gyro", name: "Burrito Gyro", desc: "Gyro slices, basmati rice, lettuce, tomatoes, onion and tzatziki sauce on a wheat tortilla", price: 10.99, category: "Gyros", image: foodBurritoGyro, modifiers: [toppings, removeIngredients, doubleMeat, makeItCombo], allergens: ["wheat", "dairy"] },
  { id: "philly-gyro", name: "Philly Gyro", desc: "Topped with Gyro slices, grilled onions, peppers and provolone cheese", price: 10.99, category: "Gyros", image: foodPhillyGyro, modifiers: [toppings, removeIngredients, doubleMeat, makeItCombo], allergens: ["wheat", "dairy"] },
  { id: "al-gyro", name: "Al Gyro", desc: "Gyro slices, peppers, onions, provolone cheese drizzled with Al sauce", price: 10.99, category: "Gyros", image: foodAlGyro, modifiers: [toppings, removeIngredients, doubleMeat, makeItCombo], allergens: ["wheat", "dairy"] },

  // ── BOWLS ────────────────────────────────────────────────────────────
  { id: "gyro-bowl", name: "Gyro Bowl", desc: "Gyro slices, lettuce, tomatoes and onions over basmati rice & drizzled with sriracha ranch", price: 11.99, category: "Bowls", image: foodGyroBowl, tag: "Popular", modifiers: [toppings, removeIngredients, doubleMeat], allergens: ["dairy"] },
  { id: "chicken-bowl", name: "Chicken Bowl", desc: "Grilled chicken, chickpeas, onions, tomatoes, cucumbers & tzatziki over basmati rice", price: 11.99, category: "Bowls", image: foodShawarmaBowl, modifiers: [toppings, removeIngredients, doubleMeat], allergens: ["dairy"] },
  { id: "falafel-bowl", name: "Falafel Bowl", desc: "Falafel fritters, chickpeas, onions, tomatoes, cucumber and feta cheese and tzatziki sauce served over rice", price: 11.99, category: "Bowls", image: foodFalafelPlate, modifiers: [toppings, removeIngredients], allergens: ["dairy"], vegetarian: true },
  { id: "buttered-chicken", name: "Buttered Chicken", desc: "Chunks of white meat chicken simmered in a creamy saffron curry sauce served over rice", price: 10.99, category: "Bowls", image: foodButteredChicken, tag: "New", modifiers: [toppings, removeIngredients], allergens: ["dairy"] },

  // ── SALADS ───────────────────────────────────────────────────────────
  { id: "gyro-salad", name: "Gyro Salad", desc: "Your choice of Gyro slices or grilled chicken, mixed lettuce, feta, onions, tomatoes, cucumbers, olives, green peppers & tzatziki sauce", price: 12.99, category: "Salads", image: foodGyroSalad, modifiers: [removeIngredients, doubleMeat], allergens: ["dairy"] },
  { id: "mediterranean-salad", name: "Mediterranean Salad", desc: "Mixed lettuce, tomatoes, cucumbers, red onions, green peppers, feta cheese & greek vinaigrette", price: 9.99, category: "Salads", image: foodMedSalad, modifiers: [removeIngredients], allergens: ["dairy"], vegetarian: true },
  { id: "falafel-salad", name: "Falafel Salad", desc: "2 Falafel fritters, lettuce, chopped greens, tomatoes, cucumbers, red cabbage, chickpeas, red onions & greek vinaigrette", price: 10.99, category: "Salads", image: foodFalafelSalad, modifiers: [removeIngredients], vegetarian: true },

  // ── APPETIZERS ───────────────────────────────────────────────────────
  { id: "hummus-plate", name: "Hummus Plate", desc: "Roasted garlic hummus served with 2 sliced pitas", price: 6.99, category: "Appetizers", image: foodHummus, tag: "Popular", modifiers: [removeIngredients], allergens: ["wheat", "sesame"], vegetarian: true },
  { id: "tzatziki-dip", name: "Tzatziki Dip", desc: "Our Homemade Tzatziki Sauce with 2 slices of Pita Bread", price: 6.99, category: "Appetizers", image: foodTzatziki, modifiers: [removeIngredients], allergens: ["wheat", "dairy"], vegetarian: true },
  { id: "spinach-pie", name: "Spinach Pie", desc: "Spinach & feta cheese inside a flaky phyllo dough with tzatziki", price: 7.99, category: "Appetizers", image: foodSpinachPie, modifiers: [removeIngredients], allergens: ["wheat", "dairy"], vegetarian: true },
  { id: "falafel-appetizer", name: "Falafel Appetizer", desc: "Five falafel fritters served with our tzatziki sauce and a sliced pita", price: 6.99, category: "Appetizers", image: foodFalafelPlate, modifiers: [removeIngredients], allergens: ["wheat", "dairy"], vegetarian: true },
  { id: "grape-leaves", name: "Stuffed Grape Leaves", desc: "Grape leaves stuffed with vegetables & rice", price: 7.99, category: "Appetizers", image: foodGrapeLeaves, modifiers: [removeIngredients], vegetarian: true },
  { id: "beef-rice-balls", name: "Beef Rice Balls", desc: "4 rice balls with side of garlic sauce", price: 7.99, category: "Appetizers", image: foodRiceBalls, modifiers: [removeIngredients], allergens: ["wheat", "dairy", "eggs"] },

  // ── SIDES / EXTRAS ───────────────────────────────────────────────────
  { id: "french-fries", name: "French Fries or Tots", desc: "Crispy fries or tater tots", price: 3.49, category: "Sides", image: foodFries, modifiers: [friesOrTots], vegetarian: true },
  { id: "cheese-fries", name: "Cheese Fries or Tots", desc: "Topped with nacho cheese", price: 4.49, category: "Sides", image: foodCheeseFries, modifiers: [friesOrTots], allergens: ["dairy"], vegetarian: true },
  { id: "greek-fries", name: "Greek Fries or Tots", desc: "Topped with crumbled feta cheese", price: 4.49, category: "Sides", image: foodGreekFries, modifiers: [friesOrTots], allergens: ["dairy"], vegetarian: true },
  { id: "stacked-fries", name: "Stacked Fries or Tots", desc: "Topped with nacho cheese & tzatziki", price: 4.99, category: "Sides", image: foodStackedFries, modifiers: [friesOrTots], allergens: ["dairy"], vegetarian: true },
  { id: "loaded-gyro-fries", name: "Loaded Gyro Fries", desc: "Topped with Gyro slices, feta cheese, lettuce, tomatoes, onion & garlic sauce", price: 12.99, category: "Sides", image: foodLoadedFries, tag: "Must Try", modifiers: [removeIngredients], allergens: ["dairy"] },
  { id: "gyro-pizza", name: "Famous Gyro Pizza", desc: "Our signature gyro pizza", price: 8.99, category: "Sides", image: foodGyroPizza, modifiers: [removeIngredients], allergens: ["wheat", "dairy"] },
  { id: "pita-pizza", name: "Pita Pizza (Cheese)", desc: "Cheese pizza on pita bread", price: 4.99, category: "Sides", image: foodPitaPizza, modifiers: [removeIngredients], allergens: ["wheat", "dairy"], vegetarian: true },
  { id: "chicken-tenders", name: "Chicken Tenders", desc: "Strips of white meat chicken, breaded and fried to a crispy golden brown & served with fries", price: 9.99, category: "Sides", image: foodChickenTenders, modifiers: [removeIngredients], allergens: ["wheat", "eggs"] },
  { id: "lentil-soup", name: "Lentil Soup", desc: "Slow-simmered red lentils with cumin, lemon, warm spices", price: 3.49, category: "Sides", image: foodLentilSoup, vegetarian: true },
  { id: "pita-bread", name: "Pita Bread", desc: "Warm pita bread", price: 1.79, category: "Sides", image: foodPitaBread, allergens: ["wheat"], vegetarian: true },
  { id: "rice-cup", name: "Rice (Cup)", desc: "Seasoned basmati rice", price: 2.49, category: "Sides", image: foodRice, vegetarian: true },
  { id: "potato-chips", name: "Potato Chips", desc: "Crispy potato chips", price: 1.99, category: "Sides", image: foodChips, vegetarian: true },
  { id: "extra-falafel", name: "Falafel Balls", desc: "Individual falafel balls", price: 0.89, category: "Sides", image: foodFalafel, vegetarian: true },
  { id: "gyro-by-pound", name: "Gyro by the Pound", desc: "Gyro slices with tzatziki sauce & sliced pita bread", price: 14.99, category: "Sides", image: foodGyro, modifiers: [removeIngredients], allergens: ["wheat", "dairy"] },

  // ── KIDS ─────────────────────────────────────────────────────────────
  { id: "kids-meal", name: "Kids Meal", desc: "Gyro slices with a side of our tzatziki sauce & sliced pita bread and drink", price: 7.99, category: "Kids", image: foodKidsMeal, modifiers: [removeIngredients], allergens: ["wheat", "dairy"] },

  // ── DESSERTS ─────────────────────────────────────────────────────────
  { id: "greek-baklava", name: "Greek Baklava", desc: "Thin layers of phyllo dough, topped with walnuts & pecans, and drizzled with pure honey", price: 3.49, category: "Desserts", image: foodBaklava, tag: "Popular", allergens: ["wheat", "tree-nuts"], vegetarian: true },
  { id: "large-baklava", name: "Large Baklava", desc: "Generous portion of our famous baklava", price: 4.49, category: "Desserts", image: foodBaklava, allergens: ["wheat", "tree-nuts"], vegetarian: true },
  { id: "tiramisu", name: "Tiramisu", desc: "Mascarpone and lady fingers delicately soaked in espresso & topped with cocoa", price: 3.99, category: "Desserts", image: foodTiramisu, allergens: ["wheat", "dairy", "eggs"], vegetarian: true },
  { id: "chocolate-cake", name: "Chocolate Cake", desc: "3 Layers of fudgy chocolate filled with chocolate mousse", price: 3.49, category: "Desserts", image: foodChocolateCake, allergens: ["wheat", "dairy", "eggs", "soy"], vegetarian: true },
  { id: "cookies", name: "Cookies", desc: "Freshly baked cookies", price: 2.49, category: "Desserts", image: foodCookies, allergens: ["wheat", "dairy", "eggs"], vegetarian: true },

  // ── DRINKS ───────────────────────────────────────────────────────────
  { id: "fountain-drink", name: "Fountain Drinks", desc: "Coca-Cola, Sprite, Fanta & more", price: 1.99, category: "Drinks", image: foodSoda, vegetarian: true },
  { id: "bottled-soda", name: "Bottled Soda", desc: "Assorted bottled sodas", price: 2.99, category: "Drinks", image: foodSoda, vegetarian: true },
  { id: "ginger-beer", name: "Ginger Beer", desc: "Refreshing ginger beer", price: 2.99, category: "Drinks", image: foodGingerBeer, vegetarian: true },
  { id: "drink-addon-1", name: "Add On 1", desc: "Quick-add drink", price: 1.00, category: "Drinks", posOnly: true },
  { id: "drink-addon-2", name: "Add On 2", desc: "Quick-add drink", price: 0.89, category: "Drinks", posOnly: true },
];

export const categories = [...new Set(menuItems.map((i) => i.category))];
