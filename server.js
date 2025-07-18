const express = require('express');
const qrcode = require('qrcode');
const app = express();

app.use(express.json());
app.use(express.static('public'));

const STATIC_UPI_ID = '9462153613@axl'; // 💰 Always send payment here

app.post('/generate-upi', async (req, res) => {
  const { name, amount } = req.body;

  if (!name || !amount) {
    return res.status(400).json({ error: 'Name and amount are required' });
  }

  const upiLink = `upi://pay?pa=${STATIC_UPI_ID}&pn=${encodeURIComponent(name)}&am=${amount}&cu=INR`;

  try {
    const qrCode = await qrcode.toDataURL(upiLink);

    res.json({
      upiLink,
      qrCode, // base64 PNG QR
      message: `Ask user to scan this QR or click the link to pay ₹${amount} to ${STATIC_UPI_ID}`,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

app.get('/', (req, res) => {
  res.send('💸 UPI Payment API is running.');
});

app.get('/pricing', (req, res) => {
  res.sendFile(__dirname + '/public/pricing.html');
});

app.post('/verify-payment', async (req, res) => {
  const { transactionId, planType, amount } = req.body;
  
  // In production, you would verify with actual payment gateway
  // For now, we'll simulate verification
  const isPaymentValid = transactionId && planType && amount;
  
  if (isPaymentValid) {
    // Store user subscription in database (implement your DB logic here)
    console.log(`✅ Payment verified: ${transactionId} for ${planType} plan - ₹${amount}`);
    
    res.json({
      success: true,
      message: 'Payment verified successfully',
      subscription: {
        planType,
        amount,
        transactionId,
        activatedAt: new Date().toISOString(),
        status: 'active'
      }
    });
  } else {
    res.status(400).json({
      success: false,
      error: 'Invalid payment details'
    });
  }
});

app.post('/payment-success', async (req, res) => {
  const { planType, amount, userEmail } = req.body;
  
  // Generate transaction ID
  const transactionId = 'TXN' + Date.now() + Math.random().toString(36).substr(2, 9);
  
  // Here you would:
  // 1. Update user's subscription in database
  // 2. Send confirmation email
  // 3. Activate pro features
  
  console.log(`🎉 Payment Success: User activated ${planType} plan for ₹${amount}`);
  
  res.json({
    success: true,
    message: `Welcome to Fiturai ${planType} Pro!`,
    transactionId,
    planDetails: {
      type: planType,
      amount,
      activatedAt: new Date().toISOString(),
      features: [
        '🧠 AI Diet Coach (GPT-4o powered)',
        '📊 Personalized Indian meal plans', 
        '🥗 AI food analyzer (image + text)',
        '🔥 Streak tracking & progress analytics',
        '📆 Smart meal scheduling',
        '🧴 Fitness + hydration reminders'
      ]
    }
  });
});

app.get('/subscription-status/:userId', (req, res) => {
  const { userId } = req.params;
  
  // In production, fetch from database
  // For demo, return sample data
  res.json({
    userId,
    subscription: {
      isActive: true,
      planType: 'monthly',
      amount: 149,
      activatedAt: '2024-01-15T10:30:00Z',
      expiresAt: '2024-02-15T10:30:00Z',
      features: ['ai_coach', 'meal_plans', 'food_analyzer', 'streak_tracking']
    }
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '192.168.124.246', () => {
  console.log(`✅ Server running on:`);
  console.log(`- Local: http://192.168.124.246:${PORT}`);
  console.log(`- Android Emulator: http://10.0.2.2:${PORT}`);
});
