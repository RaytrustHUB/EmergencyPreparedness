// State Management
const state = {
    currentSection: 'home',
    weatherData: null,
    checklistProgress: 0,
    isLoading: true,
    checklistItems: {},
    formData: {},
    notifications: [],
    lastWeatherUpdate: null,
    weatherRefreshInterval: null,
    touchStartX: 0,
    touchEndX: 0
};

// Constants
const STORAGE_KEY = 'emergency-prep-data';
const WEATHER_REFRESH_INTERVAL = 10 * 60 * 1000; // 10 minutes
const MIN_PASSWORD_LENGTH = 8;
const MAX_MESSAGE_LENGTH = 500;
const SWIPE_THRESHOLD = 100;

const INFO_CONTENT = {
    'water-info': {
        title: 'Water Supply Guidelines',
        content: `
            <p>Store 1 gallon of water per person per day for drinking and sanitation.</p>
            <ul>
                <li>Keep water in food-grade storage containers</li>
                <li>Replace water every 6 months</li>
                <li>Store in a cool, dark place</li>
                <li>Consider additional water for medical needs</li>
                <li>Include water purification methods</li>
            </ul>
        `
    },
    'food-info': {
        title: 'Food Supply Guidelines',
        content: `
            <p>Store a 10-day supply of non-perishable food items.</p>
            <ul>
                <li>Canned meats, fruits, and vegetables</li>
                <li>Dry goods (rice, pasta, crackers)</li>
                <li>High-energy foods (peanut butter, nuts)</li>
                <li>Comfort foods and snacks</li>
                <li>Baby formula if needed</li>
                <li>Pet food if applicable</li>
            </ul>
        `
    },
    'firstaid-info': {
        title: 'First Aid Kit Essentials',
        content: `
            <p>Keep a well-stocked first aid kit for emergencies.</p>
            <ul>
                <li>Bandages and gauze pads</li>
                <li>Antiseptic wipes</li>
                <li>Pain relievers</li>
                <li>Prescription medications</li>
                <li>Emergency contacts</li>
                <li>First aid manual</li>
            </ul>
        `
    }
};

const WEATHER_ICONS = {
    'clear': 'sun',
    'clouds': 'cloud',
    'rain': 'cloud-rain',
    'snow': 'snowflake',
    'thunderstorm': 'bolt',
    'drizzle': 'cloud-rain',
    'mist': 'smog'
};
const sanitizer = {
    text(input) {
        if (typeof input !== 'string') return '';
        return input.trim()
            .replace(/[<>]/g, '')
            .slice(0, 1000);
    }
};
// DOM Elements Cache
const domElements = {
    loadingScreen: document.getElementById('loading-screen'),
    sidebar: document.querySelector('.sidebar'),
    mainContent: document.querySelector('.main-content'),
    sections: document.querySelectorAll('.section'),
    navLinks: document.querySelectorAll('.nav-link'),
    checklistItems: document.querySelectorAll('.checklist-checkbox'),
    weatherDisplay: document.getElementById('weather-alert'),
    contactForm: document.querySelector('.contact-form'),
    progressBar: document.querySelector('.progress'),
    progressLabel: document.querySelector('.progress-label')
};

// Initialize App
document.addEventListener('DOMContentLoaded', async () => {
    try {
        showLoadingScreen();
        await initializeApp();
        hideLoadingScreen();
    } catch (error) {
        handleError(error);
    }
});

async function initializeApp() {
    loadStoredData();
    setupEventListeners();
    await fetchWeatherAlerts();
    initializeChecklist();
    handleInitialNavigation();
    setupFormValidation();
    initializeAnimations();
}

// Loading Screen Management
function showLoadingScreen() {
    if (domElements.loadingScreen) {
        domElements.loadingScreen.style.display = 'flex';
        state.isLoading = true;
    }
}

function hideLoadingScreen() {
    if (domElements.loadingScreen) {
        domElements.loadingScreen.classList.add('fade-out');
        setTimeout(() => {
            domElements.loadingScreen.style.display = 'none';
            state.isLoading = false;
        }, 500);
    }
}
// Share functionality
async function handleShare(e) {
    const shareType = e.currentTarget.dataset.shareType;
    const checklistData = JSON.stringify(state.checklistItems);
    
    try {
        switch (shareType) {
            case 'email':
                const emailBody = encodeURIComponent(generateShareableChecklist());
                window.location.href = `mailto:?subject=Emergency Preparedness Checklist&body=${emailBody}`;
                break;
                
            case 'clipboard':
                await navigator.clipboard.writeText(generateShareableChecklist());
                showNotification('Checklist copied to clipboard', 'success');
                break;
                
            case 'download':
                const blob = new Blob([checklistData], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'emergency-checklist.json';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                break;
        }
    } catch (error) {
        console.error('Share error:', error);
        showNotification('Error sharing checklist', 'error');
    }
}

// Map visualization
function showLocationMap() {
    if (!navigator.geolocation) {
        showNotification('Geolocation is not supported by your browser', 'error');
        return;
    }

    navigator.geolocation.getCurrentPosition(
        (position) => {
            const { latitude, longitude } = position.coords;
            const mapModal = document.getElementById('map-modal');
            const mapContainer = document.getElementById('map-container');
            
            if (mapModal && mapContainer) {
                mapModal.classList.add('active');
                // Replace with your preferred mapping service
                mapContainer.innerHTML = `
                    <iframe
                        width="100%"
                        height="400"
                        frameborder="0"
                        src="https://maps.google.com/maps?q=${latitude},${longitude}&z=15&output=embed"
                        allowfullscreen
                    ></iframe>
                `;
            }
        },
        (error) => {
            showNotification('Unable to retrieve your location', 'error');
        }
    );
}

// Save contacts
function saveContactsToDevice() {
    try {
        const contacts = Object.values(state.formData).map(contact => ({
            name: sanitizer.text(contact.name),
            phone: sanitizer.text(contact.phone),
            email: sanitizer.text(contact.email),
            relationship: sanitizer.text(contact.relationship)
        }));

        const vCards = contacts.map(contact => `
BEGIN:VCARD
VERSION:3.0
FN:${contact.name}
TEL:${contact.phone}
EMAIL:${contact.email}
NOTE:Emergency Contact - ${contact.relationship}
END:VCARD
        `.trim()).join('\n');

        const blob = new Blob([vCards], { type: 'text/vcard' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'emergency-contacts.vcf';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showNotification('Contacts saved successfully', 'success');
    } catch (error) {
        console.error('Error saving contacts:', error);
        showNotification('Error saving contacts', 'error');
    }
}

// Export checklist data
function exportChecklistData() {
    try {
        const checklistData = {
            items: state.checklistItems,
            progress: state.checklistProgress,
            lastUpdated: new Date().toISOString(),
            categories: {}
        };

        // Group items by category
        document.querySelectorAll('.checklist-category').forEach(category => {
            const categoryName = category.querySelector('h3').textContent;
            const items = Array.from(category.querySelectorAll('.checklist-item'))
                .map(item => ({
                    text: item.querySelector('label').textContent,
                    checked: item.querySelector('input').checked
                }));
            checklistData.categories[categoryName] = items;
        });

        // Create downloadable file
        const jsonString = JSON.stringify(checklistData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `emergency-checklist-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showNotification('Checklist exported successfully', 'success');
    } catch (error) {
        console.error('Export error:', error);
        showNotification('Error exporting checklist', 'error');
    }
}

// Helper function for generating shareable checklist
function generateShareableChecklist() {
    const categories = document.querySelectorAll('.checklist-category');
    let text = 'Emergency Preparedness Checklist\n\n';
    
    categories.forEach(category => {
        const categoryName = category.querySelector('h3').textContent;
        text += `${categoryName}\n`;
        
        const items = category.querySelectorAll('.checklist-item');
        items.forEach(item => {
            const checkbox = item.querySelector('input[type="checkbox"]');
            const label = item.querySelector('label').textContent;
            text += `${checkbox.checked ? '✓' : '☐'} ${label}\n`;
        });
        text += '\n';
    });
    
    return text;
}
// Action Buttons Setup - Place this BEFORE setupEventListeners
function setupActionButtons() {
    const buttons = {
        'save-checklist': () => {
            saveChecklistToStorage();
            showNotification('Checklist saved successfully', 'success');
        },
        'print-checklist': () => {
            preparePrintView();
            window.print();
        },
        'share-checklist': showShareModal,
        'reset-checklist': () => {
            if (confirm('Are you sure you want to reset your checklist? This cannot be undone.')) {
                clearChecklistStorage();
            }
        },
        'export-checklist': exportChecklistData
    };

    Object.entries(buttons).forEach(([id, handler]) => {
        const button = document.getElementById(id);
        if (button) {
            button.addEventListener('click', handler);
        }
    });

    // Set up additional buttons
    setupAdditionalButtons();
}

// Additional Buttons Setup
function setupAdditionalButtons() {
    const saveContactsBtn = document.querySelector('.save-contacts-btn');
    if (saveContactsBtn) {
        saveContactsBtn.addEventListener('click', saveContactsToDevice);
    }

    const viewMapBtn = document.querySelector('.view-map-btn');
    if (viewMapBtn) {
        // viewMapBtn.addEventListener('click', showLocationMap);
    }

    const shareButtons = document.querySelectorAll('.share-option');
    shareButtons.forEach(button => {
        button.addEventListener('click', handleShare);
    });
}
// Event Listeners Setup
function setupEventListeners() {
    // Navigation
    domElements.navLinks.forEach(link => {
        link.addEventListener('click', handleNavigation);
    });

    // Checklist Items
    domElements.checklistItems.forEach(item => {
        item.addEventListener('change', handleChecklistChange);
    });

    // Info Buttons
    document.querySelectorAll('.info-button').forEach(button => {
        button.addEventListener('click', handleInfoClick);
    });

    // Modal Close Buttons
    document.querySelectorAll('.close-button').forEach(button => {
        button.addEventListener('click', closeModal);
    });

    // Contact Form
    if (domElements.contactForm) {
        domElements.contactForm.addEventListener('submit', handleFormSubmission);
        setupFormValidation();
    }

    // Close modal on escape key
    document.addEventListener('keydown', handleKeyPress);

    // Close modal when clicking outside
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal();
            }
        });
    });

    // Action Buttons
    setupActionButtons();

    // Global Event Listeners
    window.addEventListener('hashchange', handleHashChange);
    window.addEventListener('resize', debounce(handleResize, 250));
    window.addEventListener('online', handleOnlineStatus);
    window.addEventListener('offline', handleOfflineStatus);

    // Touch Events for Mobile
    if ('ontouchstart' in window) {
        setupTouchEvents();
    }
}

// Initial Navigation Handler
function handleInitialNavigation() {
    // Get the initial section from URL hash or default to 'home'
    const initialSection = window.location.hash.slice(1) || 'home';
    
    // Update state
    state.currentSection = initialSection;

    // Update UI
    updateActiveSection(initialSection);
    updateNavigation(initialSection);

    // Initialize the section
    initializeSection(initialSection);
}

// Navigation Handling
function handleNavigation(e) {
    e.preventDefault();
    const targetSection = e.currentTarget.getAttribute('data-section');
    if (targetSection) {
        navigateToSection(targetSection);
    }
}

function navigateToSection(sectionId) {
    if (state.currentSection === sectionId) return;

    // Update state and URL
    state.currentSection = sectionId;
    window.history.pushState({ section: sectionId }, '', `#${sectionId}`);

    // Update UI
    updateActiveSection(sectionId);
    updateNavigation(sectionId);
    scrollToTop();

    // Section-specific initialization
    initializeSection(sectionId);
}

// Active Section Update
function updateActiveSection(sectionId) {
    domElements.sections.forEach(section => {
        section.classList.toggle('active', section.id === sectionId);
    });
}

// Navigation Update
function updateNavigation(sectionId) {
    domElements.navLinks.forEach(link => {
        link.classList.toggle('active', link.getAttribute('data-section') === sectionId);
    });
}

// Scroll to Top Helper
function scrollToTop() {
    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
}

function handleHashChange() {
    const hash = window.location.hash.slice(1);
    if (hash) {
        navigateToSection(hash);
    }
}

function handleResize() {
    const sidebar = document.querySelector('.sidebar');
    if (window.innerWidth > 768 && sidebar?.classList.contains('active')) {
        sidebar.classList.remove('active');
    }
}

function handleKeyPress(e) {
    if (e.key === 'Escape') {
        closeModal();
        const sidebar = document.querySelector('.sidebar');
        if (sidebar?.classList.contains('active')) {
            sidebar.classList.remove('active');
        }
    }
}

// Touch Events
function setupTouchEvents() {
    const touchStartHandler = e => {
        state.touchStartX = e.changedTouches[0].screenX;
    };
    const touchEndHandler = e => {
        state.touchEndX = e.changedTouches[0].screenX;
        handleSwipe();
    };
    
    document.addEventListener('touchstart', touchStartHandler);
    document.addEventListener('touchend', touchEndHandler);
    
    // Add cleanup to window.removeEventListener('beforeunload')
    return () => {
        document.removeEventListener('touchstart', touchStartHandler);
        document.removeEventListener('touchend', touchEndHandler);
    };
}

function handleSwipe() {
    const diff = state.touchEndX - state.touchStartX;
    if (Math.abs(diff) < SWIPE_THRESHOLD) return;

    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;

    if (diff > 0) {
        // Swipe right - show sidebar
        sidebar.classList.add('active');
    } else {
        // Swipe left - hide sidebar
        sidebar.classList.remove('active');
    }
}

// Section Initialization
function initializeSection(sectionId) {
    switch (sectionId) {
        case 'weather':
            fetchWeatherAlerts();
            break;
        case 'checklist':
            updateProgress();
            break;
        case 'contact':
            setupFormValidation();
            break;
    }
}

// Online/Offline Handlers
function handleOnlineStatus() {
    showNotification('You are back online', 'success');
    fetchWeatherAlerts();
}

function handleOfflineStatus() {
    showNotification('You are offline', 'error');
    showOfflineWeather();
}

// Checklist Management
function initializeChecklist() {
    loadChecklistFromStorage();
    updateProgress();
    setupChecklistSorting();
    setupChecklistFilters();
}

function setupChecklistSorting() {
    const categories = document.querySelectorAll('.checklist-category');
    categories.forEach(category => {
        const items = category.querySelector('.checklist-items');
        if (items) {
            // Simple drag and drop functionality
            items.querySelectorAll('.checklist-item').forEach(item => {
                item.setAttribute('draggable', true);
                item.addEventListener('dragstart', handleDragStart);
                item.addEventListener('dragover', handleDragOver);
                item.addEventListener('drop', handleDrop);
            });
        }
    });
}

function handleDragStart(e) {
    e.dataTransfer.setData('text/plain', e.target.id);
    e.target.classList.add('dragging');
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
}

function handleDrop(e) {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData('text/plain');
    const draggedElement = document.getElementById(draggedId);
    const dropTarget = e.target.closest('.checklist-item');
    
    if (draggedElement && dropTarget) {
        const container = dropTarget.parentNode;
        const draggedRect = draggedElement.getBoundingClientRect();
        const dropTargetRect = dropTarget.getBoundingClientRect();
        const draggedIndex = Array.from(container.children).indexOf(draggedElement);
        const dropTargetIndex = Array.from(container.children).indexOf(dropTarget);
        
        if (draggedIndex < dropTargetIndex) {
            dropTarget.parentNode.insertBefore(draggedElement, dropTarget.nextSibling);
        } else {
            dropTarget.parentNode.insertBefore(draggedElement, dropTarget);
        }
        
        draggedElement.classList.remove('dragging');
        saveChecklistOrder();
    }
}

function setupChecklistFilters() {
    const filterContainer = document.querySelector('.checklist-filters');
    if (!filterContainer) return;

    const filters = [
        { label: 'All', value: 'all' },
        { label: 'Completed', value: 'completed' },
        { label: 'Incomplete', value: 'incomplete' }
    ];

    const filterButtons = filters.map(filter => `
        <button class="filter-button ${filter.value === 'all' ? 'active' : ''}" 
                data-filter="${filter.value}">
            ${filter.label}
        </button>
    `).join('');

    filterContainer.innerHTML = filterButtons;

    filterContainer.addEventListener('click', e => {
        const button = e.target.closest('.filter-button');
        if (!button) return;

        // Update active state
        filterContainer.querySelectorAll('.filter-button').forEach(btn => 
            btn.classList.remove('active'));
        button.classList.add('active');

        // Apply filter
        filterChecklistItems(button.dataset.filter);
    });
}

function filterChecklistItems(filter) {
    const items = document.querySelectorAll('.checklist-item');
    items.forEach(item => {
        const checkbox = item.querySelector('input[type="checkbox"]');
        switch (filter) {
            case 'completed':
                item.style.display = checkbox.checked ? '' : 'none';
                break;
            case 'incomplete':
                item.style.display = checkbox.checked ? 'none' : '';
                break;
            default:
                item.style.display = '';
        }
    });
}

function handleChecklistChange(e) {
    const checkbox = e.target;
    const itemId = checkbox.getAttribute('data-item');
    
    if (!itemId) return;

    state.checklistItems[itemId] = checkbox.checked;
    saveChecklistToStorage();
    updateProgress();
    
    const action = checkbox.checked ? 'completed' : 'uncompleted';
    showNotification(`Item ${action}`, 'success');

    updateCategoryProgress();
}

function updateProgress() {
    const total = domElements.checklistItems.length;
    const checked = Array.from(domElements.checklistItems).filter(item => item.checked).length;
    const percentage = total > 0 ? Math.round((checked / total) * 100) : 0;

    state.checklistProgress = percentage;

    if (domElements.progressBar) {
        domElements.progressBar.style.width = `${percentage}%`;
    }

    if (domElements.progressLabel) {
        domElements.progressLabel.textContent = `${percentage}% Complete`;
    }

    updateCategoryProgress();
}

function updateCategoryProgress() {
    document.querySelectorAll('.checklist-category').forEach(category => {
        const total = category.querySelectorAll('.checklist-checkbox').length;
        const checked = category.querySelectorAll('.checklist-checkbox:checked').length;
        const percentage = total > 0 ? Math.round((checked / total) * 100) : 0;
        
        const progressBar = category.querySelector('.category-progress');
        if (progressBar) {
            progressBar.style.width = `${percentage}%`;
            progressBar.setAttribute('aria-valuenow', percentage);
        }
    });
}

// Storage Management
function loadStoredData() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            const data = JSON.parse(stored);
            state.checklistItems = data.checklistItems || {};
            state.formData = data.formData || {};
            updateUIFromState();
        }
    } catch (error) {
        console.error('Error loading stored data:', error);
        showNotification('Error loading saved data', 'error');
    }
}

function clearChecklistStorage() {
    localStorage.removeItem(STORAGE_KEY);
    state.checklistItems = {};
    updateUIFromState();
    showNotification('Checklist reset successfully', 'success');
}

function saveChecklistOrder() {
    const categories = document.querySelectorAll('.checklist-category');
    const order = {};
    categories.forEach(category => {
        const items = Array.from(category.querySelectorAll('.checklist-item'))
            .map(item => item.id);
        order[category.id] = items;
    });
    localStorage.setItem(`${STORAGE_KEY}-order`, JSON.stringify(order));
}

function saveChecklistToStorage() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            checklistItems: state.checklistItems,
            formData: state.formData,
            lastUpdated: new Date().toISOString()
        }));
    } catch (error) {
        console.error('Error saving data:', error);
        showNotification('Error saving progress', 'error');
    }
}

function loadChecklistFromStorage() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            const data = JSON.parse(stored);
            Object.entries(data.checklistItems || {}).forEach(([itemId, checked]) => {
                const checkbox = document.querySelector(`[data-item="${itemId}"]`);
                if (checkbox) {
                    checkbox.checked = checked;
                }
            });
        }
    } catch (error) {
        console.error('Error loading checklist:', error);
        showNotification('Error loading checklist', 'error');
    }
}

function updateUIFromState() {
    // Update checklist items
    Object.entries(state.checklistItems).forEach(([itemId, isChecked]) => {
        const checkbox = document.querySelector(`[data-item="${itemId}"]`);
        if (checkbox) {
            checkbox.checked = isChecked;
        }
    });

    // Update form data if exists
    Object.entries(state.formData).forEach(([fieldId, value]) => {
        const field = document.getElementById(fieldId);
        if (field) {
            field.value = value;
        }
    });

    // Update progress
    updateProgress();
}


// Weather Management
async function fetchWeatherAlerts() {
    if (!navigator.onLine) {
        showOfflineWeather();
        return;
    }

    try {
        const response = await fetch('/api/weather');
        if (!response.ok) throw new Error('Weather fetch failed');
        
        const data = await response.json();
        state.weatherData = data;
        state.lastWeatherUpdate = new Date();
        
        updateWeatherDisplay(data);
        setupWeatherRefresh();
    } catch (error) {
        console.error('Weather error:', error);
        showWeatherError();
    }
}

function updateWeatherDisplay(data) {
    const alerts = document.getElementById('current-alerts');
    const temperature = document.getElementById('temperature-display');
    const humidity = document.getElementById('humidity-display');
    const windSpeed = document.getElementById('wind-speed-display');

    if (alerts) {
        alerts.innerHTML = createWeatherAlertHTML(data);
    }

    if (temperature) temperature.textContent = `${data.temperature}°F`;
    if (humidity) humidity.textContent = `${data.humidity}%`;
    if (windSpeed) windSpeed.textContent = `${data.windSpeed} mph`;

    updateWeatherTicker(data);
}

function createWeatherAlertHTML(data) {
    return `
        <div class="weather-alert-card">
            <h3>
                <i class="fas fa-map-marker-alt"></i>
                ${data.city} Weather Conditions
            </h3>
            <div class="weather-icon">
                <i class="fas fa-${getWeatherIcon(data.description)}"></i>
            </div>
            <p class="weather-description">${data.description}</p>
        </div>
    `;
}

function getWeatherIcon(description) {
    const condition = Object.keys(WEATHER_ICONS).find(key => 
        description.toLowerCase().includes(key)
    );
    return WEATHER_ICONS[condition] || 'cloud';
}

function updateWeatherTicker(data) {
    const ticker = document.getElementById('weather-alert');
    if (ticker) {
        ticker.innerHTML = `
            <strong>${data.city}:</strong> ${data.temperature}°F | ${data.description}
            <i class="fas fa-arrow-right"></i>
        `;
    }
}

function setupWeatherRefresh() {
    if (state.weatherRefreshInterval) {
        clearInterval(state.weatherRefreshInterval);
    }
    state.weatherRefreshInterval = setInterval(fetchWeatherAlerts, WEATHER_REFRESH_INTERVAL);
}

function showOfflineWeather() {
    updateWeatherDisplay({
        city: 'Offline',
        temperature: '--',
        humidity: '--',
        windSpeed: '--',
        description: 'Weather data unavailable - You are offline'
    });
}

function showWeatherError() {
    updateWeatherDisplay({
        city: 'Error',
        temperature: '--',
        humidity: '--',
        windSpeed: '--',
        description: 'Unable to fetch weather data'
    });
    showNotification('Weather update failed', 'error');
}

// Notification System
function showNotification(message, type = 'info') {
    const id = `notification-${Date.now()}`;
    const notification = createNotificationElement(message, type, id);
    
    document.body.appendChild(notification);
    
    // Animate in
    setTimeout(() => notification.classList.add('active'), 10);
    
    // Automatically remove after delay
    setTimeout(() => {
        notification.classList.remove('active');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

function createNotificationElement(message, type, id) {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.id = id;
    
    const icon = type === 'success' ? 'check-circle' : 
                 type === 'error' ? 'exclamation-circle' : 
                 'info-circle';
    
    notification.innerHTML = `
        <i class="fas fa-${icon}"></i>
        <span>${message}</span>
        <button class="close-notice" onclick="this.parentElement.remove()">
            <i class="fas fa-times"></i>
        </button>
    `;
    
    return notification;
}

// Error Handling
function handleError(error) {
    console.error('Application error:', error);
    const errorBoundary = document.getElementById('error-boundary');
    
    if (errorBoundary) {
        errorBoundary.style.display = 'flex';
        const errorMessage = errorBoundary.querySelector('.error-content p');
        if (errorMessage) {
            errorMessage.textContent = error.message || 'An unexpected error occurred';
        }
    }
    
    hideLoadingScreen();
    showNotification(error.message || 'An unexpected error occurred', 'error');
}

function preparePrintView() {
    document.body.classList.add('print-mode');
    return new Promise(resolve => setTimeout(resolve, 100));
}

// Add validateForm function in the Form Management section
function validateForm(form) {
    let isValid = true;
    Object.keys(validators).forEach(field => {
        const input = form.querySelector(`#${field}`);
        if (input) {
            isValid = validateField(input, validators[field]) && isValid;
        }
    });
    return isValid;
}
// Form Management
function setupFormValidation() {
    const form = document.querySelector('.contact-form');
    if (!form) return;

    const validators = {
        name: (value) => value.length >= 2 || 'Name must be at least 2 characters',
        email: (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) || 'Invalid email address',
        message: (value) => {
            if (value.length < 10) return 'Message must be at least 10 characters';
            if (value.length > MAX_MESSAGE_LENGTH) return `Message must not exceed ${MAX_MESSAGE_LENGTH} characters`;
            return true;
        }
    };

    // Real-time validation
    Object.keys(validators).forEach(field => {
        const input = form.querySelector(`#${field}`);
        if (input) {
            input.addEventListener('input', debounce(() => {
                validateField(input, validators[field]);
            }, 300));
        }
    });

    // Setup character counter
    setupCharacterCounter();
}

async function handleFormSubmission(e) {
    e.preventDefault();
    try {
        const form = e.target;
        const submitButton = form.querySelector('button[type="submit"]');

        if (!validateForm(form)) return;

        setFormLoading(true, submitButton);

        // Simulate form submission (replace with actual API call)
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        showNotification('Message sent successfully!', 'success');
        form.reset();
        resetFormValidation(form);
    } catch (error) {
        ErrorBoundary.catchError(error);
        showNotification('Error sending message. Please try again.', 'error');
    } finally {
        setFormLoading(false, submitButton);
    }
}

function validateField(input, validator) {
    const value = input.value.trim();
    const result = validator(value);
    const errorElement = document.getElementById(`${input.id}-error`);
    const formGroup = input.closest('.form-group');

    if (result === true) {
        formGroup?.classList.remove('error');
        formGroup?.classList.add('success');
        if (errorElement) errorElement.textContent = '';
        return true;
    } else {
        formGroup?.classList.remove('success');
        formGroup?.classList.add('error');
        if (errorElement) errorElement.textContent = result;
        return false;
    }
}

function setupCharacterCounter() {
    const messageField = document.getElementById('message');
    const counter = document.querySelector('.char-counter');
    
    if (messageField && counter) {
        messageField.addEventListener('input', () => {
            const remaining = MAX_MESSAGE_LENGTH - messageField.value.length;
            counter.textContent = `${messageField.value.length}/${MAX_MESSAGE_LENGTH}`;
            counter.classList.toggle('error', remaining < 0);
        });
    }
}

function resetFormValidation(form) {
    const formGroups = form.querySelectorAll('.form-group');
    formGroups.forEach(group => {
        group.classList.remove('error', 'success');
        const errorElement = group.querySelector('.error-message');
        if (errorElement) {
            errorElement.textContent = '';
        }
    });
}

function setFormLoading(loading, button) {
    if (!button) return;
    
    button.disabled = loading;
    button.innerHTML = loading ? 
        '<i class="fas fa-spinner fa-spin"></i> Sending...' : 
        '<i class="fas fa-paper-plane"></i> Send Message';
}

// Modal Management
function handleInfoClick(e) {
    const infoType = e.currentTarget.getAttribute('data-info');
    const modal = document.getElementById('info-modal');
    const modalContent = document.getElementById('modal-content');
    
    if (modal && modalContent && INFO_CONTENT[infoType]) {
        const { title, content } = INFO_CONTENT[infoType];
        modalContent.innerHTML = `
            <h3>${title}</h3>
            ${content}
        `;
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

function closeModal() {
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
        modal.classList.remove('active');
    });
    document.body.style.overflow = '';
}

function showShareModal() {
    const modal = document.getElementById('share-modal');
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}
// Animation Functions
function setupProgressBarAnimation() {
    const progressBars = document.querySelectorAll('.progress');
    progressBars.forEach(bar => {
        bar.style.transition = 'width 0.5s ease-in-out';
    });
}

function setupScrollAnimations() {
    const animatedElements = document.querySelectorAll('.animate-on-scroll');
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animated');
            }
        });
    });

    animatedElements.forEach(element => observer.observe(element));
}

// Utility Functions
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Start periodic updates and initialize animations
function startPeriodicUpdates() {
    setInterval(fetchWeatherAlerts, WEATHER_REFRESH_INTERVAL);
    setInterval(saveChecklistToStorage, 5 * 60 * 1000); // Every 5 minutes
}

function initializeAnimations() {
    setupProgressBarAnimation();
    setupScrollAnimations();
    startPeriodicUpdates();
}

// Service Worker Registration
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/service-worker.js')
            .then(registration => {
                console.log('ServiceWorker registration successful');
            })
            .catch(error => {
                console.error('ServiceWorker registration failed:', error);
            });
    });
}

// Export functionality for testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        state,
        initializeApp,
        handleNavigation,
        updateProgress,
        showNotification
    };
}

// Initialize the app when DOM is ready
document.addEventListener('DOMContentLoaded', initializeApp);