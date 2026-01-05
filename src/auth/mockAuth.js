export function isLoggedIn() {
  return localStorage.getItem("loggedIn") === "true";
}

export function mockLogin() {
  localStorage.setItem("loggedIn", "true");
}

export function mockLogout() {
  localStorage.removeItem("loggedIn");
}
