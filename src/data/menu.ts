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

export interface MenuItem {
  id: string;
  name: string;
  desc: string;
  price: number;
  category: string;
  image: string;
  tag?: string;
}

export const menuItems: MenuItem[] = [
  { id: "classic-gyro", name: "Classic Gyro", desc: "Seasoned lamb & beef, fresh veggies, tzatziki, warm pita", price: 9.99, category: "Gyros", image: foodGyro, tag: "Signature" },
  { id: "chicken-gyro", name: "Chicken Gyro", desc: "Grilled chicken, crisp lettuce, tomatoes, house sauce", price: 9.99, category: "Gyros", image: foodChickenGyro },
  { id: "falafel-wrap", name: "Falafel Wrap", desc: "Crispy falafel, pickled turnips, tahini, fresh herbs", price: 8.99, category: "Gyros", image: foodFalafel },
  { id: "gyro-bowl", name: "Gyro Bowl", desc: "Gyro meat over seasoned rice, salad, tzatziki, pita on the side", price: 12.99, category: "Bowls", image: foodGyroBowl, tag: "Popular" },
  { id: "chicken-bowl", name: "Chicken Shawarma Bowl", desc: "Marinated chicken, hummus, tabbouleh, pickles over rice", price: 12.99, category: "Bowls", image: foodShawarmaBowl },
  { id: "gyro-salad", name: "Gyro Salad", desc: "Mixed greens, gyro meat, feta, olives, peppers, house vinaigrette", price: 11.99, category: "Salads", image: foodGyroSalad },
  { id: "hummus-pita", name: "Hummus & Pita", desc: "Silky chickpea hummus with olive oil, served with two warm pitas", price: 6.99, category: "Sides", image: foodHummus, tag: "Popular" },
  { id: "lentil-soup", name: "Lentil Soup", desc: "Slow-simmered red lentils with cumin, lemon, warm spices", price: 5.49, category: "Sides", image: foodLentilSoup },
  { id: "french-fries", name: "Seasoned Fries", desc: "Crispy fries with Mediterranean spice blend", price: 4.49, category: "Sides", image: foodFries },
  { id: "baklava", name: "Chocolate Baklava", desc: "Flaky phyllo, walnuts, dark chocolate, honey syrup", price: 4.99, category: "Desserts", image: foodBaklava, tag: "Must Try" },
  { id: "rice-pudding", name: "Rice Pudding", desc: "Creamy cinnamon-spiced rice pudding with pistachios", price: 4.49, category: "Desserts", image: foodRicePudding },
];

export const categories = [...new Set(menuItems.map((i) => i.category))];
