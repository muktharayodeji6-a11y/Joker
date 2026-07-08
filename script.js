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
        // Calculate price based on service
        const selectedOption = serviceSelect.options[serviceSelect.selectedIndex];
        const priceText = selectedOption.text.match(/\$([0-9.]+)/);
        const pricePer1000 = priceText ? parseFloat(priceText[1]) : 1.00;
        const totalPrice = (quantity / 1000) * pricePer1000;
        
        // Generate batches
        const batches = splitIntoBatches(quantity, hours);
        
        // Create order
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
        
        // Save order
        const orders = getOrders();
        orders.unshift(order);
        saveOrders(orders);
        
        // Save batches
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
        loadOrders();
        loadBatches();
        
    } catch (error) {
        showNotification('❌ Failed: ' + error.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '🚀 Place Order';
    }
}

// ============================================
// LOAD ORDERS
// ============================================

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
            container.innerHTML = '<p class="empty-state">No orders yet. Place your first order!</p>';
            return;
        }
        
        container.innerHTML = orders.slice(0, 20).map(order => `
            <div class="order-item">
                <div class="order-info">
                    <div class="service-name">${order.service_name}</div>
                    <div class="order-details">
                        ${order.total_quantity} items · $${order.total_price.toFixed(2)} · 
                        ${new Date(order.created_at).toLocaleString()}
                        ${order.batch_count ? ` · ${order.batch_count} batches` : ''}
                    </div>
                </div>
                <div class="order-status status-${order.status}">${order.status}</div>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('Error loading orders:', error);
    }
}

// ============================================
// LOAD BATCHES
// ============================================

function loadBatches() {
    try {
        const batches = getBatches();
        const pending = batches.filter(b => b.status === 'pending');
        document.getElementById('pendingBatches').textContent = pending.length;
        
        const container = document.getElementById('batchLog');
        if (batches.length === 0) {
            container.innerHTML = '<p class="empty-state">No batch activity yet.</p>';
            return;
        }
        
        const recent = batches.slice(-10).reverse();
        container.innerHTML = recent.map(batch => `
            <div class="batch-item">
                <div class="batch-info">
                    <div class="batch-details">Batch ${batch.id.substring(0, 8)}</div>
                    <div class="batch-meta">
                        ${batch.quantity} items · Order: ${batch.order_id.substring(0, 8)}
                        ${batch.scheduled_at ? ' · Due: ' + new Date(batch.scheduled_at).toLocaleString() : ''}
                        ${batch.processed_at ? ' · Processed: ' + new Date(batch.processed_at).toLocaleString() : ''}
                    </div>
                </div>
                <div class="batch-status status-${batch.status}">${batch.status}</div>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('Error loading batches:', error);
    }
}

// ============================================
// REFRESH ALL DATA
// ============================================

function refreshAllData() {
    showNotification('🔄 Refreshing data...', 'info');
    loadOrders();
    loadBatches();
    showNotification('✅ Data refreshed!', 'success');
}

// ============================================
// PROCESS BATCHES NOW (Manual trigger)
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
        
        loadOrders();
        loadBatches();
        
    } catch (error) {
        showNotification('❌ Processing failed: ' + error.message, 'error');
    }
}

// ============================================
// CLEAR ALL DATA (Dangerous!)
// ============================================

function clearAllData() {
    if (!confirm('⚠️ Are you sure you want to delete ALL data? This cannot be undone!')) return;
    if (!confirm('⚠️ REALLY? All orders and batches will be permanently deleted!')) return;
    
    try {
        localStorage.removeItem('orders');
        localStorage.removeItem('batches');
        
        showNotification('🗑️ All data cleared!', 'success');
        loadOrders();
        loadBatches();
        
    } catch (error) {
        showNotification('❌ Failed to clear data: ' + error.message, 'error');
    }
}

// ============================================
// NOTIFICATION SYSTEM
// ============================================

function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => notification.classList.add('show'), 10);
    
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 4000);
}

// ============================================
// INIT - Load everything on page load
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    loadOrders();
    loadBatches();
    console.log('🚀 SMM Panel Loaded!');
    
    // Auto-refresh every 30 seconds
    setInterval(() => {
        loadOrders();
        loadBatches();
    }, 30000);
});
