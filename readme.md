# Bharat Tours & Travels - Travel Booking Website

A modern, responsive travel booking website built with HTML, CSS, and JavaScript. Features package customization, user authentication, and Razorpay payment integration.

**Live Site**: https://bharatandaman.netlify.app/

## Features

### 🎨 Design
- Professional teal color scheme
- Responsive mobile-first design
- Smooth animations and transitions
- Beautiful hero carousel

### 👤 Authentication
- User registration & login
- User profiles with booking history
- Session persistence
- No backend required (uses localStorage)

### 🏖️ Travel Packages
- 4 package tiers (Budget, Standard, Luxury, Honeymoon)
- Package customization with add-ons
- Dynamic price calculation
- Search and filter functionality

### 💳 Payments
- Razorpay payment gateway integration
- Test mode enabled by default
- Secure checkout process
- Payment tracking

### 📅 Bookings
- Create, view, edit, and cancel bookings
- Booking status tracking
- User-specific booking history
- Instant booking confirmation

## Installation & Setup

### Option 1: Run Locally

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/bharatandaman.git
   cd bharatandaman
   ```

2. **Start a local server**
   ```bash
   # Using Python 3
   python -m http.server 8000
   
   # Or using Node.js
   npx http-server
   ```

3. **Open in browser**
   ```
   http://localhost:8000
   ```

### Option 2: Deploy to Netlify

1. **Push to GitHub** (see instructions below)
2. **Connect to Netlify**:
   - Go to https://netlify.com
   - Click "New site from Git"
   - Select your GitHub repository
   - Deploy!

## File Structure

```
bharatandaman/
├── index.html              # Main HTML file
├── css/
│   └── style.css          # All styling
├── js/
│   ├── script.js          # Main functionality
│   └── auth.js            # Authentication system
├── images/                # Travel destination images
├── RAZORPAY_INTEGRATION.md # Payment setup guide
├── README.md              # This file
└── package.json           # Project metadata
```

## Testing the Website

### Create Test Account
1. Click "Sign Up"
2. Enter any credentials:
   - Username: `testuser`
   - Email: `test@example.com`
   - Password: `test123`
3. Click "Register"

### Login
1. Click "Login"
2. Use the credentials from above
3. Your profile will appear

### Book a Package
1. Click on any package's "Book Now" button
2. Customize options (optional)
3. Proceed to payment
4. Use test card: `4111 1111 1111 1111`
5. Any expiry date in future
6. Any 3-digit CVV
7. Booking confirmed!

## Configuration

### Change Razorpay Key
Edit `js/script.js` line 68:
```javascript
key: 'rzp_test_1DP5MMOk9HbzOt', // Replace with your key
```

### Change Business Name
Edit `js/script.js` line 70:
```javascript
name: 'Your Company Name',
```

## Technology Stack

- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **Storage**: Browser localStorage
- **Payments**: Razorpay
- **Icons**: Font Awesome
- **Fonts**: Google Fonts (Poppins)
- **Hosting**: Netlify

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)
- Mobile browsers (iOS Safari, Chrome Mobile)

## Payment Integration

### Current Setup
- **Mode**: Test Mode
- **Gateway**: Razorpay
- **Test Card**: 4111 1111 1111 1111

### For Production
1. Create Razorpay account at https://razorpay.com
2. Complete KYC verification
3. Get live API key
4. Replace test key with live key in `js/script.js`
5. Change to live mode

See `RAZORPAY_INTEGRATION.md` for detailed instructions.

## Authentication System

### How It Works
- Uses browser localStorage (no backend required)
- Users registered locally in browser
- Session persists across page refreshes
- Bookings saved per user

### For Production
Replace localStorage with:
- Node.js/Express backend
- MongoDB or PostgreSQL database
- JWT token authentication
- Password hashing (bcrypt)

## Customization

### Change Colors
Edit `css/style.css` line 5-6:
```css
--primary-teal: #1abc9c;  /* Change this color */
```

### Add More Packages
Edit `index.html` packages section:
```html
<div class="package-card" data-name="your-package">
  <!-- Package content -->
</div>
```

### Update Images
Replace images in `images/` folder:
```
images/beach1.jpg
images/beach2.jpg
images/beach3.jpg
images/beach4.jpg
images/neil1.jpg
images/neil2.jpg
images/neil3.jpg
images/neil4.jpg
images/neil6.jpg
images/ross2.jpg
images/ross3.jpg
```

## Deployment

### Netlify (Recommended)
```bash
# 1. Push to GitHub
git push origin main

# 2. Connect on Netlify
# 3. Auto-deploys on push
```

### Manual Deployment
```bash
# Build (no build step needed for this project)
# Upload files to hosting via FTP or web dashboard
```

## Troubleshooting

### Login Not Working
- Clear browser cache
- Check browser console for errors
- Ensure JavaScript is enabled

### Payment Not Working
- Check Razorpay key is correct
- Ensure HTTPS is enabled (required for payments)
- Use test card for testing

### Images Not Loading
- Check image paths in HTML
- Ensure images are in correct folder
- Verify image file names match

## Future Enhancements

- [ ] Backend API with Node.js/Express
- [ ] Database integration (MongoDB/PostgreSQL)
- [ ] Email notifications
- [ ] SMS notifications
- [ ] Admin dashboard
- [ ] Itinerary builder
- [ ] Review system
- [ ] Wishlist feature
- [ ] Multiple payment gateways
- [ ] Multi-language support

## License

This project is open source and available under the MIT License.

## Contact

- Email: info@bharattours.com
- Phone: +91 98765 43210
- Website: https://bharatandaman.netlify.app/

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Author

Created with ❤️ for travel enthusiasts

---

**Last Updated**: February 28, 2026
**Version**: 1.0.0
**Status**: Production Ready ✅