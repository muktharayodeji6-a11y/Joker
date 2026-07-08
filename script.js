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
    const serviceSelect = document.getElementById('serviceSelect');
    const quantityInput = document.getElementById('quantity');
    const hoursSelect = document.getElementById('hoursSelect');
    
    const quantity = parseInt(quantityInput.value);
    const hours = parseInt(hoursSelect.value);
    
    if (!quantity || quantity < 10) {
        showNotification('Quantity must be at least 10', 'error');
        return;
    }
    
    if (quantity > 100000) {
        showNotification('Maximum quantity is 100,000', 'error');
        return;
    }
    
    const btn = document.getElementById('placeOrderBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Processing...';
    
    try {
        const selectedOption = serviceSelect.options[serviceSelect.selectedIndex];
        const priceText = selectedOption.text.match(/\$([0-9.]+)/);
        const pricePer1000 = priceText ? parseFloat(priceText[1]) : 1.00;
        const totalPrice = (quantity / 1000) * pricePer1000;
        
        const batches = splitIntoBatches(quantity, hours);
        
        const order = {
            id: generateId(),
            service_name: selectedOption.text,
            service_id: parseInt(serviceSelect.value),
            total_quantity: quantity,
            total_price: totalPrice,
            hours_to_complete: hours,
            status: 'pending',
            created_at: now(),
            batch_count: batches.length
        };
        
        const orders = getOrders();
        orders.unshift(order);
        saveOrders(orders);
        
        const existingBatches = getBatches();
        const batchData = batches.map(batch => ({
            id: generateId(),
            order_id: order.id,
            quantity: batch.quantity,
            scheduled_at: batch.scheduled_at,
            status: 'pending',
            api_response: null,
            processed_at: null
        }));
        saveBatches([...existingBatches, ...batchData]);
        
        showNotification(`✅ Order placed! Split into ${batches.length} batches`, 'success');
        quantityInput.value = '';
        loadAllData();
        
    } catch (error) {
        showNotification('❌ Failed: ' + error.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-rocket"></i> Place Order';
    }
}

// ============================================
// LOAD ALL DATA
// ============================================

function loadAllData() {
    loadOrders();
    loadBatches();
    updateBalanceDisplay();
    updateBadges();
}

function loadOrders() {
    try {
        const orders = getOrders();
        
        document.getElementById('totalOrders').textContent = orders.length;
        document.getElementById('completedOrders').textContent = 
            orders.filter(o => o.status === 'completed').length;
        
        const totalSpent = orders.reduce((sum, o) => sum + o.total_price, 0);
        document.getElementById('totalSpent').textContent = `$${totalSpent.toFixed(2)}`;
        
        const container = document.getElementById('orderHistory');
        if (orders.length === 0) {
            container.innerHTML = '<p class="empty-state"><i class="fas fa-inbox"></i> No orders yet</p>';
            return;
        }
        
        container.innerHTML = orders.slice(0, 20).map(order => `
            <div class="order-item">
                <div class="order-info">
                    <div class="service-name">${order.service_name}</div>
                    <div class="order-details">
                        <i class="fas fa-hashtag"></i> ${order.total_quantity} items · 
                        <i class="fas fa-dollar-sign"></i> $${order.total_price.toFixed(2)} · 
                        <i class="fas fa-clock"></i> ${new Date(order.created_at).toLocaleString()}
                        ${order.batch_count ? ` · <i class="fas fa-layer-group"></i> ${order.batch_count} batches` : ''}
                    </div>
                </div>
                <div class="order-status status-${order.status}">${order.status}</div>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('Error loading orders:', error);
    }
}

function loadBatches() {
    try {
        const batches = getBatches();
        const pending = batches.filter(b => b.status === 'pending');
        document.getElementById('pendingBatches').textContent = pending.length;
        
        const container = document.getElementById('batchLog');
        if (batches.length === 0) {
            container.innerHTML = '<p class="empty-state"><i class="fas fa-inbox"></i> No batch activity</p>';
            return;
        }
        
        const recent = batches.slice(-15).reverse();
        container.innerHTML = recent.map(batch => `
            <div class="batch-item">
                <div class="batch-info">
                    <div class="batch-details">
                        <i class="fas fa-cube"></i> Batch ${batch.id.substring(0, 8)}
                    </div>
                    <div class="batch-meta">
                        <i class="fas fa-hashtag"></i> ${batch.quantity} items · 
                        <i class="fas fa-link"></i> Order: ${batch.order_id.substring(0, 8)}
                        ${batch.scheduled_at ? ` · <i class="fas fa-calendar"></i> Due: ${new Date(batch.scheduled_at).toLocaleString()}` : ''}
                        ${batch.processed_at ? ` · <i class="fas fa-check"></i> Processed: ${new Date(batch.processed_at).toLocaleString()}` : ''}
                    </div>
                </div>
                <div class="batch-status status-${batch.status}">${batch.status}</div>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('Error loading batches:', error);
    }
}

function updateBadges() {
    const orders = getOrders();
    const batches = getBatches();
    
    document.getElementById('orderCount').textContent = `${orders.length} orders`;
    document.getElementById('batchCount').textContent = `${batches.length} batches`;
}

// ============================================
// REFRESH ALL DATA
// ============================================

function refreshAllData() {
    showNotification('🔄 Refreshing data...', 'info');
    loadAllData();
    showNotification('✅ Data refreshed!', 'success');
}

// ============================================
// PROCESS BATCHES NOW
// ============================================

async function processNow() {
    showNotification('⚡ Processing batches...', 'info');
    
    try {
        const response = await fetch(`cron/processor.html?manual=true&t=${Date.now()}`);
        const text = await response.text();
        
        if (text.includes('✅') || text.includes('Processed')) {
            showNotification('✅ Batches processed!', 'success');
        } else if (text.includes('No pending')) {
            showNotification('ℹ️ No batches to process', 'info');
        } else {
            showNotification('✅ Processing completed!', 'success');
        }
        
        loadAllData();
        
    } catch (error) {
        showNotification('❌ Processing failed: ' + error.message, 'error');
    }
}

// ============================================
// CLEAR ALL DATA
// ============================================

function clearAllData() {
    if (!confirm('⚠️ Are you sure you want to delete ALL data? This cannot be undone!')) return;
    if (!confirm('⚠️ REALLY? All orders and batches will be permanently deleted!')) return;
    
    try {
        localStorage.removeItem('orders');
        localStorage.removeItem('batches');
        
        showNotification('🗑️ All data cleared!', 'success');
        loadAllData();
        
    } catch (error) {
        showNotification('❌ Failed to clear data: ' + error.message, 'error');
    }
}

// ============================================
// NOTIFICATION SYSTEM
// ============================================

function showNotification(message, type = 'success') {
    const iconMap = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        info: 'fa-info-circle'
    };
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `<i class="fas ${iconMap[type] || 'fa-info-circle'}"></i> ${message}`;
    document.body.appendChild(notification);
    
    setTimeout(() => notification.classList.add('show'), 10);
    
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 4000);
}

// ============================================
// AUTO-REFRESH WITH LIVE BALANCE UPDATES
// ============================================

setInterval(() => {
    loadOrders();
    loadBatches();
    updateBalanceDisplay();
    updateBadges();
}, 30000);

// ============================================
// INIT - Load everything on page load
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    loadAllData();
    console.log('🚀 SMM Panel Pro Loaded!');
    console.log('💎 Live balance tracking enabled');
});
