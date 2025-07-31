const express = require('express');
const qrcode = require('qrcode');
const app = express();

// Add CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

app.use(express.json());
app.use(express.static('public'));

let STATIC_UPI_ID = '9462153613@axl'; // 💰 Always send payment here

// In-memory storage for demo (use database in production)
const pendingPayments = new Map();
const activeSubscriptions = new Map();
const usedTransactionIds = new Set(); // Track used transaction IDs

app.post('/generate-upi', async (req, res) => {
  const { name, amount, planType, phoneNumber } = req.body;

  if (!name || !amount || !planType || !phoneNumber) {
    return res.status(400).json({ error: 'Name, amount, planType, and phoneNumber are required' });
  }

  // Validate amount
  const validAmounts = ['49', '149', '499'];
  if (!validAmounts.includes(amount)) {
    return res.status(400).json({ error: 'Invalid amount. Only ₹49/week, ₹149/month, or ₹499/lifetime are allowed.' });
  }

  // Validate plan type
  const validPlans = ['weekly', 'monthly', 'lifetime'];
  if (!validPlans.includes(planType)) {
    return res.status(400).json({ error: 'Invalid plan type. Only weekly, monthly, or lifetime are allowed.' });
  }

  // Validate phone number
  if (!/^\d{10}$/.test(phoneNumber)) {
    return res.status(400).json({ error: 'Invalid phone number. Must be 10 digits.' });
  }

  // Create UPI link with proper encoding and single UPI ID
  const upiIds = [
    '9462153613@axl'
  ];
  
  // Use the primary UPI ID
  const selectedUpiId = STATIC_UPI_ID;
  
  // Create UPI link with all necessary parameters
  const upiLink = `upi://pay?pa=${selectedUpiId}&pn=${encodeURIComponent(name)}&am=${amount}&cu=INR&tn=Fiturai%20₹${amount}&mc=0000&tr=${Date.now()}`;

  try {
    const qrCode = await qrcode.toDataURL(upiLink, {
      errorCorrectionLevel: 'H', // Higher error correction for better scanning
      type: 'image/png',
      quality: 0.95,
      margin: 2,
      width: 300
    });
    
    // Generate a unique payment session ID
    const paymentSessionId = 'PAY' + Date.now() + Math.random().toString(36).substr(2, 9);
    
    // Store pending payment details
    pendingPayments.set(paymentSessionId, {
      name,
      amount,
      planType,
      phoneNumber,
      upiId: selectedUpiId,
      createdAt: new Date(),
      status: 'pending'
    });

    console.log(`💰 Payment generated: ${name} - ₹${amount} - ${planType} plan - UPI: ${selectedUpiId}`);

    res.json({
      paymentSessionId,
      upiLink,
      qrCode, // base64 PNG QR
      message: `Please pay ₹${amount} to ${selectedUpiId}`,
      instructions: [
        '1. Scan the QR code or click the UPI link',
        '2. Complete the payment using any UPI app (Paytm, PhonePe, Google Pay, etc.)',
        '3. Copy the transaction ID from your payment app',
        '4. Enter the transaction ID below and click "Verify Payment"'
      ],
      upiDetails: {
        upiId: selectedUpiId,
        amount: amount,
        planType: planType,
        description: `Fiturai ₹${amount}`,
        alternativeUpiIds: upiIds.filter(id => id !== selectedUpiId)
      }
    });
  } catch (err) {
    console.error('QR generation error:', err);
    res.status(500).json({ error: 'Failed to generate QR code. Please try again.' });
  }
});

app.post('/verify-transaction', async (req, res) => {
  const { paymentSessionId, transactionId } = req.body;
  
  if (!paymentSessionId || !transactionId) {
    return res.status(400).json({ 
      success: false, 
      error: 'Payment session ID and transaction ID are required' 
    });
  }

  // Get pending payment details
  const pendingPayment = pendingPayments.get(paymentSessionId);
  
  if (!pendingPayment) {
    return res.status(404).json({ 
      success: false, 
      error: 'Payment session not found or expired' 
    });
  }

  // In production, verify transaction ID with payment gateway
  // For demo, we'll simulate verification with basic checks
  const isTransactionValid = await verifyTransactionWithGateway(transactionId, pendingPayment);
  
  if (isTransactionValid) {
    // Generate subscription ID
    const subscriptionId = 'SUB' + Date.now() + Math.random().toString(36).substr(2, 9);
    
    // Calculate expiry date (7 days for basic, 15 days for pro, 30 days for premium)
    let expiryDays;
    switch(pendingPayment.planType) {
      case 'weekly':
        expiryDays = 7;
        break;
      case 'monthly':
        expiryDays = 30; // Assuming 30 days for monthly
        break;
      case 'lifetime':
        expiryDays = 365; // Assuming 365 days for lifetime
        break;
      default:
        expiryDays = 7;
    }
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiryDays);
    
    // Store active subscription
    activeSubscriptions.set(pendingPayment.phoneNumber, {
      subscriptionId,
      planType: pendingPayment.planType,
      amount: pendingPayment.amount,
      transactionId,
      activatedAt: new Date().toISOString(),
      expiresAt: expiresAt.toISOString(),
      status: 'active'
    });
    
    // Remove from pending payments
    pendingPayments.delete(paymentSessionId);
    
    console.log(`✅ Plan activated: ${pendingPayment.phoneNumber} - ${pendingPayment.planType} plan`);
    
    res.json({
      success: true,
      message: `Welcome to Fiturai!`,
      subscription: {
        subscriptionId,
        planType: pendingPayment.planType,
        amount: pendingPayment.amount,
        transactionId,
        activatedAt: new Date().toISOString(),
        expiresAt: expiresAt.toISOString(),
        status: 'active'
      }
    });
  } else {
    res.status(400).json({
      success: false,
      error: 'Invalid transaction ID. Please check and try again.',
      message: 'The transaction ID you provided could not be verified. Please ensure you have copied it correctly from your payment app.'
    });
  }
});

// Helper function to verify transaction with payment gateway
async function verifyTransactionWithGateway(transactionId, paymentDetails) {
  // In production, make API call to payment gateway
  // For demo, simulate verification with basic validation
  
  // Basic validation: transaction ID should be alphanumeric and reasonable length
  if (!transactionId || transactionId.length < 8 || transactionId.length > 50) {
    return false;
  }
  
  // Check if transaction ID has already been used
  if (usedTransactionIds.has(transactionId)) {
    console.warn(`⚠️ Transaction ID already used: ${transactionId}`);
    return false;
  }
  
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // For demo: accept any transaction ID that looks valid
  // In production, verify with actual payment gateway
  const isValid = true;
  
  // Mark transaction ID as used only if verification is successful
  if (isValid) {
    usedTransactionIds.add(transactionId);
    console.log(`✅ Transaction ID marked as used: ${transactionId}`);
  }
  
  return isValid;
}

// Test UPI endpoint
app.get('/test-upi', async (req, res) => {
  try {
    const upiIds = [
      '9462153613@axl'
    ];
    
    const testUpiLink = `upi://pay?pa=${STATIC_UPI_ID}&pn=Test&am=1&cu=INR&tn=Test%20Payment&mc=0000&tr=${Date.now()}`;
    const qrCode = await qrcode.toDataURL(testUpiLink, {
      errorCorrectionLevel: 'H',
      type: 'image/png',
      quality: 0.95,
      margin: 2,
      width: 300
    });
    
    res.json({
      upiId: STATIC_UPI_ID,
      testLink: testUpiLink,
      qrCode: qrCode,
      message: 'UPI test QR generated successfully',
      alternativeUpiIds: upiIds.filter(id => id !== STATIC_UPI_ID),
      instructions: [
        '1. Scan the QR code to test UPI functionality',
        '2. This will open your default UPI app',
        '3. You can cancel the payment after seeing the UPI interface',
        '4. If one UPI ID doesn\'t work, try the alternative UPI IDs'
      ]
    });
  } catch (err) {
    console.error('Test UPI error:', err);
    res.status(500).json({ error: 'Failed to generate test UPI' });
  }
});

// Change UPI ID endpoint
app.post('/change-upi', (req, res) => {
  const { newUpiId } = req.body;
  
  if (!newUpiId || !newUpiId.includes('@')) {
    return res.status(400).json({ 
      error: 'Invalid UPI ID format. Must be in format: number@handle' 
    });
  }
  
  // Update the UPI ID
  STATIC_UPI_ID = newUpiId;
  
  console.log(`🔄 UPI ID changed to: ${newUpiId}`);
  
  res.json({
    success: true,
    message: `UPI ID updated to ${newUpiId}`,
    newUpiId: newUpiId
  });
});

// Get current UPI status
app.get('/upi-status', (req, res) => {
  res.json({
    currentUpiId: STATIC_UPI_ID,
    status: 'active',
    supportedApps: [
      'Paytm',
      'PhonePe', 
      'Google Pay',
      'BHIM',
      'Amazon Pay',
      'WhatsApp Pay'
    ],
    troubleshooting: [
      'If UPI ID shows "not payable", try alternative UPI IDs',
      'Make sure the UPI ID is registered and active',
      'Try different UPI apps if one doesn\'t work',
      'Check if the UPI ID format is correct (number@handle)'
    ]
  });
});

app.get('/', (req, res) => {
  res.send('💸 UPI Payment API is running.');
});

app.get('/pricing', (req, res) => {
  res.sendFile(__dirname + '/public/pricing.html');
});

app.get('/subscription-status/:phoneNumber', (req, res) => {
  const { phoneNumber } = req.params;
  
  const subscription = activeSubscriptions.get(phoneNumber);
  
  if (subscription) {
    // Check if subscription is still active
    const now = new Date();
    const expiresAt = new Date(subscription.expiresAt);
    
    if (now > expiresAt) {
      subscription.status = 'expired';
    }
    
    res.json({
      phoneNumber,
      subscription
    });
  } else {
    res.json({
      phoneNumber,
      subscription: {
        isActive: false,
        status: 'no_subscription'
      }
    });
  }
});

// Get pending payment status
app.get('/payment-status/:paymentSessionId', (req, res) => {
  const { paymentSessionId } = req.params;
  
  const pendingPayment = pendingPayments.get(paymentSessionId);
  
  if (pendingPayment) {
    res.json({
      paymentSessionId,
      status: 'pending',
      details: pendingPayment
    });
  } else {
    res.status(404).json({
      error: 'Payment session not found'
    });
  }
});

// Combined subscription status and payment session endpoint
app.get('/subscription-status/:phoneNumber/:paymentSessionId', (req, res) => {
  const { phoneNumber, paymentSessionId } = req.params;
  
  // Get subscription status
  let subscription = activeSubscriptions.get(phoneNumber);
  
  // Get payment session status
  const pendingPayment = pendingPayments.get(paymentSessionId);
  
  // Prepare response object
  const response = {
    phoneNumber,
    paymentSessionId,
    subscription: null,
    paymentSession: null
  };
  
  // If payment session exists and no active subscription, activate the plan
  if (pendingPayment && !subscription) {
    // Generate subscription ID
    const subscriptionId = 'SUB' + Date.now() + Math.random().toString(36).substr(2, 9);
    
    // Generate unique auto transaction ID
    let autoTransactionId = 'AUTO_ACTIVATED_' + Date.now();
    let counter = 1;
    while (usedTransactionIds.has(autoTransactionId)) {
      autoTransactionId = 'AUTO_ACTIVATED_' + Date.now() + '_' + counter;
      counter++;
    }
    usedTransactionIds.add(autoTransactionId);
    
    // Calculate expiry date (7 days for basic, 15 days for pro, 30 days for premium)
    let expiryDays;
    switch(pendingPayment.planType) {
      case 'weekly':
        expiryDays = 7;
        break;
      case 'monthly':
        expiryDays = 30; // Assuming 30 days for monthly
        break;
      case 'lifetime':
        expiryDays = 365; // Assuming 365 days for lifetime
        break;
      default:
        expiryDays = 7;
    }
    
    const activatedAt = new Date();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiryDays);
    
    // Create subscription object
    subscription = {
      subscriptionId,
      planType: pendingPayment.planType,
      amount: pendingPayment.amount,
      transactionId: autoTransactionId,
      activatedAt: activatedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      status: 'active'
    };
    
    // Store active subscription
    activeSubscriptions.set(phoneNumber, subscription);
    
    // Remove from pending payments
    pendingPayments.delete(paymentSessionId);
    
    console.log(`✅ Plan auto-activated: ${phoneNumber} - ₹${pendingPayment.amount} via payment session`);
    console.log(`✅ Auto transaction ID used: ${autoTransactionId}`);
  }
  
  // Add subscription info
  if (subscription) {
    // Check if subscription is still active
    const now = new Date();
    const expiresAt = new Date(subscription.expiresAt);
    
    if (now > expiresAt) {
      subscription.status = 'expired';
      subscription.isActive = false;
    } else {
      subscription.isActive = true;
    }
    
    // Ensure start and end dates are present
    if (!subscription.startDate) {
      subscription.startDate = subscription.activatedAt;
    }
    if (!subscription.endDate) {
      subscription.endDate = subscription.expiresAt;
    }
    
    response.subscription = subscription;
  } else {
    response.subscription = {
      isActive: false,
      status: 'no_subscription'
    };
  }
  
  // Add payment session info
  if (pendingPayment) {
    response.paymentSession = {
      status: 'pending',
      details: pendingPayment
    };
  } else {
    response.paymentSession = {
      status: 'not_found',
      error: 'Payment session not found or expired'
    };
  }
  
  res.json(response);
});

// List all active subscriptions (for debugging)
app.get('/all-subscriptions', (req, res) => {
  const subscriptions = [];
  
  activeSubscriptions.forEach((subscription, phoneNumber) => {
    // Check if subscription is still active
    const now = new Date();
    const expiresAt = new Date(subscription.expiresAt);
    
    if (now > expiresAt) {
      subscription.status = 'expired';
    }
    
    subscriptions.push({
      phoneNumber,
      subscription
    });
  });
  
  res.json({
    totalSubscriptions: subscriptions.length,
    subscriptions: subscriptions
  });
});

// List all used transaction IDs (for debugging)
app.get('/used-transaction-ids', (req, res) => {
  const transactionIds = Array.from(usedTransactionIds);
  
  res.json({
    totalUsedTransactionIds: transactionIds.length,
    transactionIds: transactionIds
  });
});

const PORT = process.env.PORT || 5000;
const HOST = process.env.NODE_ENV === 'production' ? undefined : '192.168.170.246';

app.listen(PORT, HOST, () => {
  if (process.env.NODE_ENV === 'production') {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`🌐 Production URL available`);
  } else {
    console.log(`✅ Server running on:`);
    console.log(`- Local: http://192.168.170.246:${PORT}`);
    console.log(`- Android Emulator: http://10.0.2.2:${PORT}`);
  }
});
