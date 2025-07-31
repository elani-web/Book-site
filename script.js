function displayBookCovers(books) {
  const bookList = document.getElementById('book-list');
  books.forEach(book => {
    const bookDiv = document.createElement('div');
    const title = document.createElement('h3');
    title.textContent = book.title;
    const img = document.createElement('img');
    img.src = `http://covers.openlibrary.org/b/isbn/${book.isbn && book.isbn[0]}-M.jpg`;
    const author = document.createElement('p');
    author.textContent = `Author: ${book.author_name && book.author_name[0]}`;
    bookDiv.appendChild(title);
    bookDiv.appendChild(img);
    bookDiv.appendChild(author);
    bookList.appendChild(bookDiv);
  });
}