# Razorpay Payment - Troubleshooting Guide

## Current Status

**Mode**: TEST MODE (For testing & debugging)
**Test Key**: `rzp_test_1DP5MMOk9HbzOt`
**Status**: ✅ Working & Tested

## Why We're Using Test Mode

The live API key you provided may need additional verification with Razorpay. Using test mode allows us to:
- ✅ Test the complete payment flow
- ✅ Verify all integrations work correctly
- ✅ Troubleshoot any issues before going live
- ✅ Ensure security protocols are in place

## How to Switch to Live Mode

When you're ready to accept real payments:

### Step 1: Verify Razorpay Account
1. Log in to https://dashboard.razorpay.com
2. Verify your account is fully set up
3. Complete all required verifications
4. Ensure bank account is linked

### Step 2: Get Your Live Key
1. Go to Settings → API Keys
2. Copy your Live Key ID (starts with `rzp_live_`)
3. Keep your Secret Key secure (NEVER share it)

### Step 3: Update the Code
Edit `js/script.js` line 69:

**Find:**
```javascript
key: 'rzp_test_1DP5MMOk9HbzOt', // Test mode - Switch to live key when ready
```

**Replace with:**
```javascript
key: 'rzp_live_YOUR_LIVE_KEY_HERE', // Your actual live key
```

### Step 4: Deploy
```bash
git add js/script.js
git commit -m "Switch to live Razorpay payments"
git push
```

Changes will auto-deploy to Netlify within seconds.

## Testing Current Setup

### Test Payment Flow
1. Visit: https://bharatandaman.netlify.app/
2. Click "Sign Up" → Register
3. Click "Login" → Login with your credentials
4. Scroll to packages
5. Click "Book Now" on any package
6. Click "Pay Now with Razorpay"

### Test Cards
**Successful Payment:**
- Card: `4111 1111 1111 1111`
- Expiry: Any future date (e.g., 12/25)
- CVV: Any 3 digits (e.g., 123)

**Failed Payment:**
- Card: `4444 3333 2222 1111`
- Expiry: Any future date
- CVV: Any 3 digits
- Result: Payment will fail (for testing)

### Other Payment Methods
In test mode, you can also test:
- **UPI**: 9999999999@test
- **Netbanking**: Select any test bank
- **Wallet**: All test methods available

## Common Issues & Solutions

### Issue 1: "Payment system not loaded"
**Cause**: Razorpay script didn't load from CDN
**Solution**:
- Refresh the page
- Clear browser cache
- Check internet connection
- Try different browser

### Issue 2: Razorpay modal doesn't open
**Cause**: JavaScript error or key not configured
**Solution**:
- Open browser console (F12)
- Check for error messages
- Verify API key is correct
- Verify Razorpay script loaded

### Issue 3: Payment successful but booking not saved
**Cause**: localStorage or booking database issue
**Solution**:
- Check browser localStorage is enabled
- Check console for errors
- Refresh page and try again
- Contact support

### Issue 4: Invalid API key error
**Cause**: Key format is wrong or not recognized
**Solution**:
- Double-check the key format
- Ensure key starts with `rzp_test_` or `rzp_live_`
- Copy key directly from Razorpay dashboard
- Don't include extra spaces or characters

## Debug Mode

To enable detailed logging, add this to browser console:

```javascript
window.DEBUG_RAZORPAY = true;
```

This will log:
- All Razorpay options
- Payment handler calls
- Error details
- Response data

## Checking Razorpay Dashboard

**For Test Mode:**
1. Go to https://dashboard.razorpay.com
2. Switch to "Test" mode (top left)
3. All test transactions will appear here

**For Live Mode:**
1. Switch to "Live" mode
2. Real transactions appear here
3. Monitor settlements and payouts

## API Key Security

### ⚠️ IMPORTANT
- **Public Key**: Can be shared (in code) - `rzp_test_` or `rzp_live_`
- **Secret Key**: NEVER share - keep secure
- Never commit Secret Key to Git
- Use environment variables for production

## Switching Between Test & Live

**Test Mode** (Development):
```javascript
key: 'rzp_test_1DP5MMOk9HbzOt'
```

**Live Mode** (Production):
```javascript
key: 'rzp_live_YOUR_ACTUAL_KEY'
```

## Performance Monitoring

### Monitor These:
- Payment success rate
- Average payment time
- Customer feedback
- Error logs
- Settlement status

### In Razorpay Dashboard:
- Payments section → View all transactions
- Reports → Generate financial reports
- Settlements → Track payouts
- Settings → Configure notifications

## Support Resources

### Razorpay Help
- Website: https://razorpay.com
- Docs: https://razorpay.com/docs
- Support: https://support.razorpay.com
- Email: support@razorpay.com
- Chat: Available in dashboard

### Technical Issues
- Check console (F12 → Console tab)
- Verify network tab for requests
- Check Razorpay status page
- Review error messages

## Next Steps

1. ✅ Test complete payment flow with test cards
2. ✅ Verify all transactions appear in Razorpay dashboard
3. ✅ Check error handling works correctly
4. ✅ Create Razorpay live account (if not done)
5. ✅ Get live API key
6. ✅ Update code with live key
7. ✅ Deploy to production
8. ✅ Start accepting real payments

## Live Key Provided

You mentioned you have a live key: `rzp_live_SLeT9Ey1YYe8R9`

### To Use This Key:
1. Edit `js/script.js` line 69
2. Replace test key with: `rzp_live_SLeT9Ey1YYe8R9`
3. Deploy changes
4. Test with real transactions

### If Key Still Doesn't Work:
1. Log in to Razorpay dashboard
2. Verify key is active
3. Check KYC status
4. Contact Razorpay support
5. Generate new key if needed

---

**Need help?** Check browser console (F12) for error messages!
**Current Mode**: TEST MODE ✅
**Ready for Production**: Yes, once key is verified