// ============================================
// DATA STORAGE FUNCTIONS
// ============================================

function getOrders() {
    const data = localStorage.getItem('orders');
    return data ? JSON.parse(data) : [];
}

function saveOrders(orders) {
    localStorage.setItem('orders', JSON.stringify(orders));
}

function getBatches() {
    const data = localStorage.getItem('batches');
    return data ? JSON.parse(data) : [];
}

function saveBatches(batches) {
    localStorage.setItem('batches', JSON.stringify(batches));
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

function now() {
    return new Date().toISOString();
}

// ============================================
// BALANCE CALCULATION FROM BATCH LOG
// ============================================

function calculateBalance() {
    const orders = getOrders();
    const batches = getBatches();
    
    // Calculate total spent from completed orders
    const totalSpent = orders.reduce((sum, order) => sum + order.total_price, 0);
    
    // Calculate pending value (orders not yet completed)
    const pendingTotal = orders
        .filter(o => o.status !== 'completed')
        .reduce((sum, order) => sum + order.total_price, 0);
    
    // Calculate completed batch value
    const completedBatches = batches.filter(b => b.status === 'completed');
    const batchValue = completedBatches.reduce((sum, b) => sum + b.quantity, 0);
    
    // Calculate estimated earnings (you can customize this formula)
    const estimatedEarnings = batchValue * 0.001; // Example: $0.001 per item
    
    return {
        totalSpent: totalSpent,
        pendingTotal: pendingTotal,
        batchValue: batchValue,
        estimatedEarnings: estimatedEarnings,
        completedOrders: orders.filter(o => o.status === 'completed').length,
        totalOrders: orders.length,
        pendingBatches: batches.filter(b => b.status === 'pending').length
    };
}

// ============================================
// UPDATE LIVE BALANCE DISPLAY
// ============================================

function updateBalanceDisplay() {
    const balance = calculateBalance();
    const balanceElement = document.getElementById('liveBalance');
    const changeElement = document.getElementById('balanceChange');
    
    if (balanceElement) {
        const oldValue = parseFloat(balanceElement.textContent.replace('$', ''));
        const newValue = balance.totalSpent;
        
        balanceElement.textContent = `$${newValue.toFixed(2)}`;
        
        // Show change
        if (changeElement) {
            const change = newValue - oldValue;
            if (change > 0) {
                changeElement.textContent = `+$${change.toFixed(2)}`;
                changeElement.style.color = '#10b981';
            } else if (change < 0) {
                changeElement.textContent = `-$${Math.abs(change).toFixed(2)}`;
                changeElement.style.color = '#ef4444';
            } else {
                changeElement.textContent = '±$0.00';
                changeElement.style.color = '#8892b0';
            }
        }
        
        // Animate balance update
        balanceElement.classList.remove('balance-update');
        void balanceElement.offsetWidth; // Trigger reflow
        balanceElement.classList.add('balance-update');
    }
}

// ============================================
// SPLIT INTO RANDOM BATCHES
// ============================================

function splitIntoBatches(totalQuantity, hoursToComplete) {
    const minBatches = CONFIG.MIN_BATCHES || 8;
    const maxBatches = CONFIG.MAX_BATCHES || 20;
    const jitter = CONFIG.BATCH_JITTER_MINUTES || 3;
    
    const numBatches = Math.floor(Math.random() * (maxBatches - minBatches + 1)) + minBatches;
    const batches = [];
    let remaining = totalQuantity;
    const totalMinutes = hoursToComplete * 60;
    const nowTime = Date.now();
    
    for (let i = 0; i < numBatches - 1; i++) {
        const maxBatch = Math.ceil(remaining * 0.25);
        const minBatch = Math.max(5, Math.ceil(remaining * 0.05));
        const batchSize = Math.floor(Math.random() * 
            (Math.min(maxBatch, remaining - (numBatches - i - 1)) - minBatch + 1)) + minBatch;
        
        const minuteOffset = Math.floor(Math.random() * totalMinutes);
        const scheduledTime = new Date(nowTime + minuteOffset * 60000);
        
        batches.push({
            quantity: batchSize,
            scheduled_at: scheduledTime.toISOString()
        });
        
        remaining -= batchSize;
    }
    
    const lastMinutes = Math.floor(Math.random() * totalMinutes);
    batches.push({
        quantity: remaining,
        scheduled_at: new Date(nowTime + lastMinutes * 60000).toISOString()
    });
    
    batches.forEach(batch => {
        const jitterMinutes = Math.floor(Math.random() * jitter * 2) - jitter;
        const date = new Date(batch.scheduled_at);
        date.setMinutes(date.getMinutes() + jitterMinutes);
        batch.scheduled_at = date.toISOString();
    });
    
    batches.sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
    return batches;
}

// ============================================
// PLACE ORDER
// ============================================

async function placeOrder() {
    const serviceSelect =
