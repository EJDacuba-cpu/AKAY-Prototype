export const demoAccounts = [
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

export function loginUser(email, password) {
  const user = demoAccounts.find(
    (account) => account.email === email && account.password === password,
  );

  if (!user) {
    return null;
  }

  localStorage.setItem("akay_user", JSON.stringify(user));
  return user;
}

export function getCurrentUser() {
  const storedUser = localStorage.getItem("akay_user");
  return storedUser ? JSON.parse(storedUser) : null;
}

export function logoutUser() {
  localStorage.removeItem("akay_user");
}
