import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import pg from "pg";

const { Pool } = pg;
const app = express();
const port = 3000;

// Database pool setup
const pool = new Pool({
    user: "postgres",
    host: "localhost",
    database: "bookshelf",
    password: "JFrancisco143",
    port: 5433,
});

app.set("view engine", "ejs");
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

// Error handler middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send("Something broke!");
});

// GET: Home page - sorted by recency or rating + search + pagination
app.get("/", async (req, res, next) => {
  try {
    const sort = req.query.sort || "recency";
    const search = req.query.search || "";
    const page = parseInt(req.query.page) || 1;
    const limit = 6;
    const offset = (page - 1) * limit;

    const sortQuery =
      sort === "rating" ? "ORDER BY rating DESC" : "ORDER BY date_read DESC";

    const queryText = `
      SELECT * FROM books
      WHERE title ILIKE $1 OR author ILIKE $1
      ${sortQuery} LIMIT $2 OFFSET $3
    `;

    const totalQuery = `
      SELECT COUNT(*) FROM books
      WHERE title ILIKE $1 OR author ILIKE $1
    `;

    const [booksResult, totalCountResult] = await Promise.all([
      pool.query(queryText, [`%${search}%`, limit, offset]),
      pool.query(totalQuery, [`%${search}%`]),
    ]);

    const books = booksResult.rows;

    // Fetch cover URLs using Open Library Covers API
    for (let book of books) {
      if (book.olid) {
        book.cover_url = `https://covers.openlibrary.org/b/olid/${book.olid}-M.jpg`;
      } else {
        book.cover_url = null;
      }
    }

    const totalPages = Math.ceil(totalCountResult.rows[0].count / limit);

    res.render("index", {
      books,
      currentPage: page,
      totalPages,
      search,
      sort,
    });
  } catch (err) {
    next(err);
  }
});

// GET: Add book form
app.get("/add", (req, res) => {
  res.render("add");
});

// POST: Fetch book info by OLID or ISBN
app.post("/fetch", async (req, res, next) => {
  const { id_type, id_value } = req.body;
  try {
    const response = await axios.get(`https://openlibrary.org/api/books?bibkeys=${id_type}:${id_value}&format=json&jscmd=data`);
    const bookData = response.data[`${id_type}:${id_value}`];

    if (bookData) {
      const populated = {
        title: bookData.title || "",
        author: bookData.authors?.[0]?.name || "",
        olid: bookData.key?.split("/").pop() || "",
      };
      res.json(populated);
    } else {
      res.status(404).json({ error: "Book not found" });
    }
  } catch (err) {
    next(err);
  }
});

// POST: Add book
app.post("/add", async (req, res, next) => {
  const { title, author, review, rating, date_read, olid } = req.body;
  try {
    await pool.query(
      "INSERT INTO books (title, author, review, rating, date_read, olid) VALUES ($1, $2, $3, $4, $5, $6)",
      [title, author, review, rating, date_read, olid]
    );
    res.redirect("/");
  } catch (err) {
    next(err);
  }
});

// GET: Edit form
app.get("/edit/:id", async (req, res, next) => {
  try {
    const result = await pool.query("SELECT * FROM books WHERE id = $1", [
      req.params.id,
    ]);
    res.render("edit", { book: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// POST: Update book
app.post("/edit/:id", async (req, res, next) => {
  const { title, author, review, rating, date_read, olid } = req.body;
  try {
    await pool.query(
      "UPDATE books SET title=$1, author=$2, review=$3, rating=$4, date_read=$5, olid=$6 WHERE id=$7",
      [title, author, review, rating, date_read, olid, req.params.id]
    );
    res.redirect("/");
  } catch (err) {
    next(err);
  }
});

// POST: Delete book
app.post("/delete/:id", async (req, res, next) => {
  try {
    await pool.query("DELETE FROM books WHERE id = $1", [req.params.id]);
    res.redirect("/");
  } catch (err) {
    next(err);
  }
});

app.listen(port, () => {
  console.log(`Book tracker app listening at http://localhost:${port}`);
});

/*
PostgreSQL Schema:

CREATE TABLE books (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  review TEXT,
  rating INTEGER CHECK (rating >= 0 AND rating <= 5),
  date_read DATE,
  olid TEXT -- Open Library ID to fetch cover
);
*/
