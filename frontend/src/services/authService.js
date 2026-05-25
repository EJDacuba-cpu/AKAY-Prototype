import { getItem, removeItem, setItem } from "./storageService";

const USER_KEY = "akay_user";

const demoAccounts = [
  {
    email: "admin@akay.com",
    password: "admin123",
    role: "admin",
    name: "Demo MHO",
    position: "Municipal Health Officer",
    facility: "RHU Bulakan",
  },
  {
    email: "bhc@akay.com",
    password: "bhc123",
    role: "bhc",
    name: "Demo Midwife",
    position: "Barangay Health Worker",
    facility: "Pitpitan Health Center",
  },
  {
    email: "rhu@akay.com",
    password: "rhu123",
    role: "rhu",
    name: "Demo RHU Staff",
    position: "RHU Staff",
    facility: "Rural Health Unit Bulakan",
  },
];

export function getUser() {
  return getItem(USER_KEY, null);
}

export function saveUser(user) {
  setItem(USER_KEY, user);
  return user;
}

export function logout() {
  removeItem(USER_KEY);
}

export function loginUser(email, password) {
  const user = demoAccounts.find(
    (account) => account.email === email && account.password === password,
  );

  if (!user) {
    return null;
  }

  saveUser(user);
  return user;
}
