# PrintStudio — Smart CNIC Layout Generator

PrintStudio is a modern web application built with Angular that enables users to generate clean, print-ready CNIC layouts on A4 pages. Users can upload front and back images, crop them precisely, control copy distribution, and export a structured PDF in a few steps.

---

## Overview

This project solves a common real-world problem: arranging CNIC copies efficiently for printing. Instead of manually resizing and aligning images in tools like Word or Photoshop, PrintStudio automates the entire workflow with accuracy and speed.

---

## Features

### Image Upload

* Upload front and back sides of CNIC cards
* Drag and drop support
* Multiple CNIC pairs (up to 4 pairs / 8 slots)

### Cropping System

* Auto-crop for quick adjustments
* Manual crop with:

  * Drag-to-select interface
  * Grid overlay for alignment
  * Live preview feedback

### Layout Engine

* Automatically arranges images into a 2 × 4 grid
* Supports:

  * Front-only layouts
  * Back-only layouts
  * Dual-page layouts (front and back)

### Copy Management

* Select number of copies per CNIC (2, 4, 6, 8)
* Dynamic slot allocation system
* Real-time slot usage tracking

### PDF Export

* Generates high-quality A4 PDF files
* Maintains correct CNIC aspect ratio
* Separate pages for front and back sides
* Built using jsPDF

### User Interface

* Clean and responsive design
* Light and dark theme support
* Mobile-friendly layout
* Smooth dialog-based workflow

---

## Tech Stack

* Frontend: Angular
* Language: TypeScript
* Styling: CSS
* PDF Generation: jsPDF
* Image Processing: HTML5 Canvas API

---

## Project Structure

```plaintext
src/
│
├── app/
│   ├── app-component.ts       # Application logic
│   ├── app-component.html     # UI structure
│   ├── app-component.css      # Styling
│
└── assets/
```

---

## Application Flow

1. Upload CNIC images (front and back)
2. Preview and crop images
3. Select number of copies per CNIC
4. Generate A4 layout automatically
5. Download the final PDF

---

## Installation

```bash
# Clone the repository
https://github.com/iamfaizall20/printstudio.git

# Install dependencies
npm install

# Run the application
ng serve
```

Open the application in your browser:

```
http://localhost:4200
```

---

## Use Cases

* Photocopy and printing shops
* Office documentation workflows
* Personal document organization
* Bulk CNIC print preparation

---

## Future Improvements

* AI-based smart cropping
* Drag-and-drop slot reordering
* Template saving functionality
* Cloud storage integration
* Support for additional card formats

---

## Author

Faizal Hassan
Frontend Developer

---

## License

This project is licensed under the MIT License.

---

## Contribution

Contributions are welcome. You can:

* Fork the repository
* Create a new branch
* Submit a pull request

---

PrintStudio focuses on simplicity, precision, and efficiency in document layout generation.
