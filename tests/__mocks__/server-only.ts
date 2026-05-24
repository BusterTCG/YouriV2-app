// Stub vide pour neutraliser `import "server-only"` dans les tests Vitest.
// Le vrai module "server-only" provoque une erreur au build quand il est
// importé dans un contexte client — dans nos tests on simule l'environnement
// serveur sans avoir besoin de ce garde-fou.
export {};
