import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import passport from "passport";
import { Strategy } from "passport-local";
import flash from "connect-flash";
import session from "express-session";
import pgSession from "connect-pg-simple";
import dotenv from "dotenv";
import bcrypt from "bcrypt";
import axios from "axios";

dotenv.config();

const app = express();
const port = 3000;
const saltRounds = 10;

app.set('view engine', 'ejs');

const { Pool } = pg;
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not defined');
}
if (!process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET environment variable is not defined');
}

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
});

const sessionStore = new (pgSession(session))({
  pool: db,
  tableName: 'session',
});

app.use(session({
  store: sessionStore,
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
}));

db.on('error', (err) => {
  console.error('Database connection error:', err);
});

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use(passport.initialize());
app.use(passport.session());
app.use(flash());

app.get("/", (req, res) => {
  res.render("home.ejs");
});

app.get("/login", (req, res) => {
  res.render("login.ejs" , { messages: {error: req.flash('error')}});
});

app.get("/register", (req, res) => {
  res.render("register.ejs");
});

app.get("/bookstore", (req, res) => {
  const query = req.query.q || 'fiction';
  axios.get(`http://openlibrary.org/search.json?q=${query}`)
    .then(response => {
      const books = response.data.docs.slice(0, 8);
      res.render("bookstore", { books });
    })
    .catch(error => {
      console.error('Error:', error.message);
      res.status(500).render("error", { message: "Failed to fetch books" });
    });
});

app.get("/book/:book_id", async (req, res) => {
   const bookId = req.params.book_id;
    try {
    const response = await axios.get(`https://openlibrary.org/works/${bookId}.json`);
    const bookData = response.data;
   // Fetch author data
    const authorKey = bookData.authors[0].author.key;
    const authorResponse = await axios.get(`https://openlibrary.org${authorKey}.json`);
    const authorName = authorResponse.data.name;
   // Fetch reviews from database
    const reviewResult = await db.query(
      "SELECT * FROM reviews WHERE book_id = $1 ORDER BY created_at DESC",
      [bookId]
    );
   // Render the review template with the book data, author name, and reviews
    res.render("review", {
      book: bookData,
      author: authorName,
      reviews: reviewResult.rows,
    });
  } catch (error) {
    console.error(`Error fetching book with ID ${bookId}:`, error);
    res.status(500).send('Error fetching book');
  }
});

app.post("/bookstore/review", async (req, res) => {
  const { book_id, thoughts, rating } = req.body;
  const bookIdWithoutWorks = book_id.replace('/works/', '');
  const user_id = req.body.user_id || 0;
  try {
    const result = await db.query(
      "INSERT INTO reviews (book_id, review_text, rating, user_id) VALUES ($1, $2, $3, $4)",
      [bookIdWithoutWorks, thoughts, rating, user_id]
    );
    res.redirect("/bookstore");
  } catch (err) {
    console.log(err);
    res.status(500).send("Error creating review");
  }
});

app.patch('/reviews/:reviewId', async (req, res) => {
  const reviewId = req.params.reviewId;
  const newReviewText = req.body.review_text;
  try {
    await db.query('UPDATE reviews SET review_text = $1 WHERE id = $2', [newReviewText, reviewId]);
    res.send('Review updated successfully');
  } catch (error) {
    console.error(error);
    res.status(500).send('Error updating review');
  }
});

app.get("/logout", (req, res) => {
  req.logout(function (err) {
    if (err) {
      return next(err);
    }
    res.redirect("/");
  });
});

app.get('/reviews/:reviewId/edit', async (req, res) => {
  const reviewId = req.params.reviewId;
  try {
    const reviewResult = await db.query("SELECT * FROM reviews WHERE id = $1", [reviewId]);
    const review = reviewResult.rows[0];
    const bookId = review.book_id;
    const response = await axios.get(`https://openlibrary.org/works/${bookId}.json`);
    const book = response.data;
    res.render('edit-review', { review, book });
  } catch (error) {
    console.error(error);
    res.status(500).send('Error fetching review');
  }
});

app.get("/search", async (req, res) => {
  try {
    const query = req.query.q;
    const results = await db.query(`
      SELECT books.id, books.title, authors.name AS author_name 
      FROM books 
      JOIN authors ON books.author_id = authors.id 
      WHERE books.title LIKE $1 OR authors.name LIKE $1
    `, [`%${query}%`]);
    res.json(results.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error occurred during search" });
  }
});

app.post(
  "/login",
  passport.authenticate("local", {
    successRedirect: "/bookstore",
    failureRedirect: "/login",
    failureFlash: true,
  })
);

app.post("/register", async (req, res) => {
  const email = req.body.username;
  const password = req.body.password;

  try {
    const checkResult = await db.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);

    if (checkResult.rows.length > 0) {
      req.redirect("/login");
    } else {
      bcrypt.hash(password, saltRounds, async (err, hash) => {
        if (err) {
          console.error("Error hashing password:", err);
        } else {
          const result = await db.query(
            "INSERT INTO users (email, password) VALUES ($1, $2) RETURNING *",
            [email, hash]
          );
          const user = result.rows[0];
          req.login(user, (err) => {
            console.log("success");
            res.redirect("/bookstore");
          });
        }
      });
    }
  } catch (err) {
    console.log(err);
  }
});

app.post("/bookstore/review", async (req, res) => {
  const { book_id, thoughts, rating } = req.body;
  const user_id = req.body.user_id || 0;
  try {
    const result = await db.query(
      "INSERT INTO reviews (book_id, review_text, rating, user_id) VALUES ($1, $2, $3, $4)",
      [book_id, thoughts, rating, user_id]
    );
    res.redirect("/bookstore");
  } catch (err) {
    console.log(err);
    res.status(500).send("Error creating review");
  }
});

app.post("/reviews/:reviewId/edit", async (req, res) => {
  const reviewId = req.params.reviewId;
  const { thoughts, rating } = req.body;
  try {
    const result = await db.query(
      "UPDATE reviews SET review_text = $1, rating = $2 WHERE id = $3",
      [thoughts, rating, reviewId]
    );
    res.redirect(`/book/${req.query.bookId}`);
  } catch (err) {
    console.log(err);
    res.status(500).send("Error updating review");
  }
});

passport.use(
  new Strategy(async function verify(username, password, cb) {
    try {
      const result = await db.query("SELECT * FROM users WHERE email = $1 ", [
        username,
      ]);
      if (result.rows.length > 0) {
        const user = result.rows[0];
        const storedHashedPassword = user.password;
        bcrypt.compare(password, storedHashedPassword, (err, valid) => {
          if (err) {
            //Error with password check
            console.error("Error comparing passwords:", err);
            return cb(err);
          } else {
            if (valid) {
              //Passed password check
              return cb(null, user);
            } else {
              //Did not pass password check
              return cb(null, false, {message: "Invalid credentials."});
            }
          }
        });
      } else {
        return cb(null, false, { message:"User not found"});
      }
    } catch (err) {
      console.log(err);
    }
  })
);

passport.serializeUser((user, cb) => {
  cb(null, user);
});
passport.deserializeUser((user, cb) => {
  cb(null, user);
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
