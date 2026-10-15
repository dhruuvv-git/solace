/**
 * Serverless auth — no backend required.
 * Users are stored in localStorage as a salted hash (scrypt not available in all
 * browsers, so we use SHA-256 which is fine for a hackathon prototype with no
 * sensitive server side data at stake).
 *
 * Session = a random token written to localStorage so it survives page refresh.
 */

const USERS_KEY = 'solace_users';
const SESSION_KEY = 'solace_session';

function loadUsers() {
  try { return JSON.parse(localStorage.getItem(USERS_KEY) || '{}'); } catch { return {}; }
}

function saveUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

async function hashPassword(password) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('solace:' + password));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function makeToken() {
  return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
}

function getSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; }
}

function setSession(user) {
  const token = makeToken();
  localStorage.setItem(SESSION_KEY, JSON.stringify({ token, user }));
  return user;
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

export const LocalAuth = {
  me: () => {
    const sess = getSession();
    return sess ? { user: sess.user } : null;
  },

  signUp: async ({ name, email, password }) => {
    const users = loadUsers();
    const key = email.toLowerCase().trim();
    if (users[key]) throw new Error('An account with this email already exists. Try logging in.');
    const hash = await hashPassword(password);
    const user = { id: makeToken(), name: name.trim(), email: key, createdAt: Date.now() };
    users[key] = { hash, user };
    saveUsers(users);
    return { user: setSession(user) };
  },

  signIn: async ({ email, password }) => {
    const users = loadUsers();
    const key = email.toLowerCase().trim();
    const record = users[key];
    if (!record) throw new Error('No account found with this email. Please sign up first.');
    const hash = await hashPassword(password);
    if (hash !== record.hash) throw new Error('Incorrect password.');
    return { user: setSession(record.user) };
  },

  signOut: () => {
    clearSession();
  },

  updateAccount: ({ name }) => {
    const sess = getSession();
    if (!sess) throw new Error('Not signed in.');
    const users = loadUsers();
    const key = sess.user.email;
    if (users[key]) {
      users[key].user.name = name;
      saveUsers(users);
      sess.user.name = name;
      setSession(sess.user);
    }
    return { user: sess.user };
  },
};
