import { SAMPLE } from "./database.js";
export const datasets = {
  instagram: {
    name: "Mini Instagram",
    schema: SAMPLE,
    examples: {
      "First query": "SELECT id, username, email\nFROM users\nWHERE id <= 3;",
      "Join tables":
        "SELECT users.username, posts.caption\nFROM posts\nJOIN users ON users.id = posts.user_id;",
      "Count posts":
        "SELECT users.username, COUNT(posts.id) AS post_count\nFROM users\nLEFT JOIN posts ON posts.user_id = users.id\nGROUP BY users.id\nORDER BY post_count DESC;",
    },
  },
  bookstore: {
    name: "Bookstore",
    schema: `PRAGMA foreign_keys = ON;
CREATE TABLE authors (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE books (id INTEGER PRIMARY KEY, author_id INTEGER NOT NULL REFERENCES authors(id), title TEXT NOT NULL, price REAL NOT NULL CHECK(price >= 0));
CREATE TABLE sales (id INTEGER PRIMARY KEY, book_id INTEGER NOT NULL REFERENCES books(id), quantity INTEGER NOT NULL CHECK(quantity > 0));
INSERT INTO authors VALUES (1,'Ada Brooks'),(2,'Leo Chen'),(3,'Maya Shah');
INSERT INTO books VALUES (1,1,'The Small Garden',18.50),(2,2,'A Map of Stars',24.00),(3,1,'Slow Sundays',16.00),(4,3,'Learning SQL',32.00);
INSERT INTO sales VALUES (1,1,3),(2,2,2),(3,4,5),(4,1,1);`,
    examples: {
      "First query": "SELECT id, title, price\nFROM books\nORDER BY price;",
      "Join tables":
        "SELECT books.title, authors.name, books.price\nFROM books\nJOIN authors ON authors.id = books.author_id;",
      "Sales totals":
        "SELECT books.title, SUM(sales.quantity) AS copies,\n       ROUND(SUM(sales.quantity * books.price), 2) AS revenue\nFROM sales\nJOIN books ON books.id = sales.book_id\nGROUP BY books.id\nORDER BY revenue DESC;",
    },
  },
  blank: {
    name: "Empty database",
    schema: "PRAGMA foreign_keys = ON;",
    examples: {
      "First query":
        "CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT);\nINSERT INTO notes VALUES (1, 'Hello SQLite');\nSELECT * FROM notes;",
    },
  },
};
export const datasetFor = (workspace) =>
  datasets[workspace?.dataset] || datasets.instagram;
