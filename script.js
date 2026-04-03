// BarrPeps Database - Main JavaScript
// Blood-Brain Barrier Penetrating Peptides Database

let peptidesData = [];
let currentView = 'table';
let sortColumn = 'peptide_name';
let sortDirection = 'asc';
let filteredPeptides = [];

// PDB Viewer variables
let pdbViewer = null;
let pdbContentCache = null;
let currentRepresentation = 'cartoon';
let disulfideBonds = [];
let currentShapes = [];

// Selected amino acids for filtering
let selectedAAs = [];

// Chart instances
let lengthChart = null;
let chargeChart = null;
let aaChart = null;

// Helper functions
function getPeptideUrl(peptideId, peptideName) {
    return `peptide.html?id=${peptideId}&name=${encodeURIComponent(peptideName)}`;
}

// Escape HTML for safe display
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Copy SMILES to clipboard
function copySMILES(smiles) {
    navigator.clipboard.writeText(smiles).then(() => {
        const btn = document.querySelector('.copy-btn');
        if (btn) {
            const originalText = btn.textContent;
            btn.textContent = 'Copied!';
            setTimeout(() => {
                btn.textContent = originalText;
            }, 2000);
        }
    }).catch(() => {
        alert('Failed to copy SMILES');
    });
}

// Show under construction modal
function showUnderConstruction() {
    const modal = document.getElementById('underConstructionModal');
    if (modal) {
        modal.style.display = 'flex';
    }
}

// Close modal
function closeModal() {
    const modal = document.getElementById('underConstructionModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Close modal when clicking outside
window.onclick = function(event) {
    const modal = document.getElementById('underConstructionModal');
    if (event.target === modal) {
        closeModal();
    }
}

// Load CSV data
async function loadCSV() {
    try {
        console.log('Loading CSV...');
        const response = await fetch('structure_ACPBBBP.csv');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const csvText = await response.text();
        console.log('CSV loaded, length:', csvText.length);
        parseCSV(csvText);
    } catch (error) {
        console.error('Error loading CSV:', error);
        const errorHtml = `
            <div class="error-message">
                <p>Error loading data: ${error.message}</p>
                <p>Please ensure structure_ACPBBBP.csv is in the same directory.</p>
                <button onclick="location.reload()" class="btn-primary" style="margin-top: 1rem;">Retry</button>
            </div>
        `;
        
        const containers = ['featuredPeptides', 'resultsContainer', 'peptideDetail'];
        containers.forEach(id => {
            const container = document.getElementById(id);
            if (container && container.innerHTML && container.innerHTML.includes('Loading')) {
                container.innerHTML = errorHtml;
            }
        });
    }
}

function parseCSV(csvText) {
    const lines = csvText.split('\n').filter(line => line.trim() !== '');
    if (lines.length === 0) {
        console.error('CSV is empty');
        return;
    }
    
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    console.log('Headers:', headers);
    
    peptidesData = [];
    
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        
        let fields = [];
        let inQuotes = false;
        let currentField = '';
        
        for (let j = 0; j < line.length; j++) {
            const char = line[j];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                fields.push(currentField.trim());
                currentField = '';
            } else {
                currentField += char;
            }
        }
        fields.push(currentField.trim());
        
        if (fields.length >= headers.length) {
            const peptide = {};
            headers.forEach((header, index) => {
                let value = fields[index] || '';
                if (value.startsWith('"') && value.endsWith('"')) {
                    value = value.slice(1, -1);
                }
                peptide[header] = value;
            });
            
            peptide.length = parseInt(peptide.length) || 0;
            peptide.molecular_weight = parseFloat(peptide.molecular_weight) || 0;
            peptide.net_charge = parseFloat(peptide.net_charge) || 0;
            peptide.hydrophobicity = parseFloat(peptide.hydrophobicity) || 0;
            peptide.id = i;
            
            peptidesData.push(peptide);
        }
    }
    
    console.log('Parsed peptides:', peptidesData.length);
    filteredPeptides = [...peptidesData];
    
    const currentPage = window.location.pathname.split('/').pop();
    console.log('Current page:', currentPage);
    
    if (currentPage === 'index.html' || currentPage === '') {
        initHomePage();
    } else if (currentPage === 'browse.html') {
        initBrowsePage();
    } else if (currentPage === 'peptide.html') {
        initPeptidePage();
    }
}

// ========== CHART FUNCTIONS ==========

// Calculate amino acid frequencies across all peptides
function calculateAADistribution() {
    const aaCounts = {
        'A': 0, 'R': 0, 'N': 0, 'D': 0, 'C': 0, 'Q': 0, 'E': 0, 'G': 0,
        'H': 0, 'I': 0, 'L': 0, 'K': 0, 'M': 0, 'F': 0, 'P': 0, 'S': 0,
        'T': 0, 'W': 0, 'Y': 0, 'V': 0
    };
    
    let totalAAs = 0;
    
    peptidesData.forEach(peptide => {
        const seq = peptide.sequence_one_letter || '';
        for (let i = 0; i < seq.length; i++) {
            const aa = seq[i];
            if (aaCounts.hasOwnProperty(aa)) {
                aaCounts[aa]++;
                totalAAs++;
            }
        }
    });
    
    const aaPercentages = {};
    for (const [aa, count] of Object.entries(aaCounts)) {
        aaPercentages[aa] = totalAAs > 0 ? (count / totalAAs * 100).toFixed(1) : 0;
    }
    
    return aaPercentages;
}

// Calculate length distribution (binned)
function calculateLengthDistribution() {
    const lengths = peptidesData.map(p => p.length).filter(l => l > 0);
    const maxLength = Math.max(...lengths);
    
    const binSize = 10;
    const bins = {};
    
    for (let i = 0; i <= maxLength + binSize; i += binSize) {
        const binStart = i;
        const binEnd = i + binSize;
        const binLabel = `${binStart}-${binEnd}`;
        bins[binLabel] = 0;
    }
    
    lengths.forEach(length => {
        const binIndex = Math.floor(length / binSize);
        const binStart = binIndex * binSize;
        const binEnd = binStart + binSize;
        const binLabel = `${binStart}-${binEnd}`;
        bins[binLabel]++;
    });
    
    const filteredBins = {};
    let hasData = false;
    for (const [label, count] of Object.entries(bins)) {
        if (count > 0) hasData = true;
        if (hasData || count > 0) {
            filteredBins[label] = count;
        }
    }
    
    return filteredBins;
}

// Calculate charge distribution
function calculateChargeDistribution() {
    const charges = peptidesData.map(p => p.net_charge).filter(c => c !== null && c !== '');
    const chargeCounts = {};
    
    charges.forEach(charge => {
        const roundedCharge = Math.round(charge);
        const key = roundedCharge >= 0 ? `+${roundedCharge}` : `${roundedCharge}`;
        chargeCounts[key] = (chargeCounts[key] || 0) + 1;
    });
    
    const sortedKeys = Object.keys(chargeCounts).sort((a, b) => {
        const numA = parseInt(a) || 0;
        const numB = parseInt(b) || 0;
        return numA - numB;
    });
    
    const sortedCounts = {};
    sortedKeys.forEach(key => {
        sortedCounts[key] = chargeCounts[key];
    });
    
    return sortedCounts;
}

// Create length distribution chart
function createLengthChart() {
    const ctx = document.getElementById('lengthChart');
    if (!ctx) return;
    
    const distribution = calculateLengthDistribution();
    
    const labels = Object.keys(distribution);
    const data = Object.values(distribution);
    
    if (lengthChart) {
        lengthChart.destroy();
    }
    
    lengthChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Number of Peptides',
                data: data,
                backgroundColor: 'rgba(66, 153, 225, 0.7)',
                borderColor: 'rgba(66, 153, 225, 1)',
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'top',
                    labels: { font: { size: 10 } }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `${context.raw} peptides`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Count',
                        font: { size: 10 }
                    },
                    ticks: { stepSize: 1, font: { size: 9 } }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Length (amino acids)',
                        font: { size: 10 }
                    },
                    ticks: { font: { size: 8 }, rotation: 45 }
                }
            }
        }
    });
}

// Create charge distribution chart
function createChargeChart() {
    const ctx = document.getElementById('chargeChart');
    if (!ctx) return;
    
    const distribution = calculateChargeDistribution();
    
    const labels = Object.keys(distribution);
    const data = Object.values(distribution);
    
    if (chargeChart) {
        chargeChart.destroy();
    }
    
    const backgroundColors = labels.map(label => {
        const val = parseInt(label);
        if (val > 0) return 'rgba(66, 153, 225, 0.7)';
        if (val < 0) return 'rgba(245, 101, 101, 0.7)';
        return 'rgba(160, 174, 192, 0.7)';
    });
    
    const borderColors = labels.map(label => {
        const val = parseInt(label);
        if (val > 0) return 'rgba(66, 153, 225, 1)';
        if (val < 0) return 'rgba(245, 101, 101, 1)';
        return 'rgba(160, 174, 192, 1)';
    });
    
    chargeChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Number of Peptides',
                data: data,
                backgroundColor: backgroundColors,
                borderColor: borderColors,
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'top',
                    labels: { font: { size: 10 } }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `${context.raw} peptides`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Count',
                        font: { size: 10 }
                    },
                    ticks: { stepSize: 1, font: { size: 9 } }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Net Charge',
                        font: { size: 10 }
                    },
                    ticks: { font: { size: 9 } }
                }
            }
        }
    });
}

// Create amino acid frequency chart
function createAAChart() {
    const ctx = document.getElementById('aaChart');
    if (!ctx) return;
    
    const distribution = calculateAADistribution();
    
    const labels = Object.keys(distribution);
    const data = Object.values(distribution);
    
    if (aaChart) {
        aaChart.destroy();
    }
    
    const colors = [
        '#4299e1', '#48bb78', '#ed8936', '#9f7aea', '#f56565',
        '#38b2ac', '#ecc94b', '#ed64a6', '#a0aec0', '#4a5568',
        '#4299e1', '#48bb78', '#ed8936', '#9f7aea', '#f56565',
        '#38b2ac', '#ecc94b', '#ed64a6', '#a0aec0', '#4a5568'
    ];
    
    aaChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Frequency (%)',
                data: data,
                backgroundColor: colors.slice(0, labels.length),
                borderColor: colors.slice(0, labels.length),
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'top',
                    labels: { font: { size: 10 } }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `${context.raw}% of all residues`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Frequency (%)',
                        font: { size: 10 }
                    },
                    ticks: { font: { size: 9 } }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Amino Acid',
                        font: { size: 10 }
                    },
                    ticks: { font: { size: 9 }, weight: 'bold' }
                }
            }
        }
    });
}

// ========== HOME PAGE FUNCTIONS ==========

function initHomePage() {
    console.log('Initializing home page');
    updateHomeStats();
    displayFeaturedPeptides();
    
    setTimeout(() => {
        if (peptidesData.length > 0) {
            createLengthChart();
            createChargeChart();
            createAAChart();
        }
    }, 100);
}

function updateHomeStats() {
    const total = peptidesData.length;
    if (total === 0) return;
    
    const avgLength = peptidesData.reduce((sum, p) => sum + p.length, 0) / total;
    const avgCharge = peptidesData.reduce((sum, p) => sum + (parseFloat(p.net_charge) || 0), 0) / total;
    
    const totalEl = document.getElementById('totalPeptides');
    const avgLengthEl = document.getElementById('avgLength');
    const avgChargeEl = document.getElementById('avgCharge');
    
    if (totalEl) totalEl.textContent = total;
    if (avgLengthEl) avgLengthEl.textContent = avgLength.toFixed(1);
    if (avgChargeEl) avgChargeEl.textContent = avgCharge.toFixed(1);
}

function displayFeaturedPeptides() {
    const container = document.getElementById('featuredPeptides');
    if (!container) return;
    
    const featured = peptidesData.slice(0, 6);
    
    if (featured.length === 0) {
        container.innerHTML = '<div class="loading">No peptides found in database</div>';
        return;
    }
    
    let html = '';
    featured.forEach(peptide => {
        const peptideUrl = getPeptideUrl(peptide.id, peptide.peptide_name);
        
        html += `
            <div class="peptide-card" onclick="window.location.href='${peptideUrl}'" style="cursor: pointer;">
                <div class="card-header">
                    <h3 style="color: #2c5282;">${peptide.peptide_name || 'Unnamed Peptide'}</h3>
                </div>
                <div class="card-content">
                    <div class="card-row">
                        <div class="card-label">Source:</div>
                        <div class="card-value">${peptide.source_organism || 'N/A'}</div>
                    </div>
                    <div class="card-row">
                        <div class="card-label">Length / MW:</div>
                        <div class="card-value">${peptide.length || 'N/A'} aa / ${peptide.molecular_weight ? peptide.molecular_weight.toFixed(1) : 'N/A'} Da</div>
                    </div>
                    <div class="card-row">
                        <div class="card-label">BBB Permeability:</div>
                        <div class="card-value">${peptide.bbb_permeability_value || 'N/A'}</div>
                    </div>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

// ========== BROWSE PAGE FUNCTIONS ==========

function initBrowsePage() {
    console.log('Initializing browse page');
    filteredPeptides = [...peptidesData];
    updateBrowseStats();
    displayBrowseResults();
    setupBrowseEventListeners();
    initAASelector();
}

function setupBrowseEventListeners() {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                applyAllFilters();
            }
        });
    }
}

function updateBrowseStats() {
    const count = filteredPeptides.length;
    const countElement = document.getElementById('resultsCount');
    if (countElement) countElement.textContent = `Found peptides: ${count}`;
}

// Initialize compact amino acid selector
function initAASelector() {
    const buttons = document.querySelectorAll('.aa-btn-compact');
    buttons.forEach(btn => {
        btn.addEventListener('click', function() {
            const aa = this.getAttribute('data-aa');
            if (this.classList.contains('selected')) {
                this.classList.remove('selected');
                selectedAAs = selectedAAs.filter(a => a !== aa);
            } else {
                this.classList.add('selected');
                selectedAAs.push(aa);
            }
        });
    });
}

// Check if sequence contains all selected amino acids
function containsAllAAs(sequence, requiredAAs) {
    if (!requiredAAs || requiredAAs.length === 0) return true;
    return requiredAAs.every(aa => sequence && sequence.includes(aa));
}

// Check modification
function checkModification(peptide, modType) {
    const notes = (peptide.notes || '').toLowerCase();
    const name = (peptide.peptide_name || '').toLowerCase();
    
    switch(modType) {
        case 'amidation': return notes.includes('amid') || name.includes('amid');
        case 'acylation': return notes.includes('acyl') || name.includes('acyl');
        case 'cyclization': return notes.includes('cycl') || notes.includes('cyclic');
        case 'glycosylation': return notes.includes('glyco');
        case 'phosphorylation': return notes.includes('phospho');
        default: return true;
    }
}

// Apply all filters
function applyAllFilters() {
    const searchTerm = document.getElementById('searchInput') ? document.getElementById('searchInput').value.toLowerCase() : '';
    const activityFilter = document.getElementById('activityFilter') ? document.getElementById('activityFilter').value : 'all';
    const structureFilter = document.getElementById('structureFilter') ? document.getElementById('structureFilter').value : 'all';
    const lengthMin = (document.getElementById('lengthMin') ? parseInt(document.getElementById('lengthMin').value) : 0) || 0;
    const lengthMax = (document.getElementById('lengthMax') ? parseInt(document.getElementById('lengthMax').value) : 100) || 1000;
    const pdbFilter = document.getElementById('pdbFilter') ? document.getElementById('pdbFilter').value : 'all';
    const transportFilter = document.getElementById('transportFilter') ? document.getElementById('transportFilter').value : 'all';
    const modelFilter = document.getElementById('modelFilter') ? document.getElementById('modelFilter').value : 'all';
    const modFilter = document.getElementById('modFilter') ? document.getElementById('modFilter').value : 'all';
    
    let tempFiltered = [...peptidesData];
    
    // Search filter
    if (searchTerm) {
        tempFiltered = tempFiltered.filter(p => 
            (p.peptide_name && p.peptide_name.toLowerCase().includes(searchTerm)) ||
            (p.sequence_one_letter && p.sequence_one_letter.toLowerCase().includes(searchTerm)) ||
            (p.source_organism && p.source_organism.toLowerCase().includes(searchTerm))
        );
    }
    
    // Length filter
    tempFiltered = tempFiltered.filter(p => p.length >= lengthMin && p.length <= lengthMax);
    
    // Activity/BBB permeability filter
    if (activityFilter !== 'all') {
        tempFiltered = tempFiltered.filter(p => {
            const permValue = parseFloat(p.bbb_permeability_value);
            if (isNaN(permValue)) return false;
            if (activityFilter === 'high') return permValue > 0.3;
            if (activityFilter === 'medium') return permValue >= 0 && permValue <= 0.3;
            if (activityFilter === 'low') return permValue < 0;
            return true;
        });
    }
    
    // Structure type filter
    if (structureFilter !== 'all') {
        tempFiltered = tempFiltered.filter(p => (p.structure_type || '').toLowerCase() === structureFilter.toLowerCase());
    }
    
    // PDB filter
    if (pdbFilter !== 'all') {
        if (pdbFilter === 'yes') {
            tempFiltered = tempFiltered.filter(p => p.PDB && p.PDB !== '' && p.PDB !== 'N/A');
        } else {
            tempFiltered = tempFiltered.filter(p => !p.PDB || p.PDB === '' || p.PDB === 'N/A');
        }
    }
    
    // Transport type filter
    if (transportFilter !== 'all') {
        tempFiltered = tempFiltered.filter(p => {
            const transport = (p.bbb_transport_type || '').toLowerCase();
            switch(transportFilter) {
                case 'penetration': return transport.includes('penetration') || transport.includes('cell penetrating');
                case 'lipid': return transport.includes('lipid') || transport.includes('liposomal');
                case 'endosomal': return transport.includes('endosomal') || transport.includes('fusion');
                case 'carrier': return transport.includes('carrier') || transport.includes('solute');
                case 'receptor': return transport.includes('receptor');
                case 'passive': return transport.includes('passive');
                default: return true;
            }
        });
    }
    
    // Model filter
    if (modelFilter !== 'all') {
        tempFiltered = tempFiltered.filter(p => (p.bbb_model || '').toLowerCase() === modelFilter.toLowerCase());
    }
    
    // Modification filter
    if (modFilter !== 'all') {
        tempFiltered = tempFiltered.filter(p => checkModification(p, modFilter));
    }
    
    // Amino acid composition filter
    if (selectedAAs.length > 0) {
        tempFiltered = tempFiltered.filter(p => containsAllAAs(p.sequence_one_letter || '', selectedAAs));
    }
    
    filteredPeptides = tempFiltered;
    updateBrowseStats();
    displayBrowseResults();
}

// Reset all filters
function resetAllFilters() {
    const searchInput = document.getElementById('searchInput');
    const lengthMin = document.getElementById('lengthMin');
    const lengthMax = document.getElementById('lengthMax');
    const activityFilter = document.getElementById('activityFilter');
    const structureFilter = document.getElementById('structureFilter');
    const pdbFilter = document.getElementById('pdbFilter');
    const transportFilter = document.getElementById('transportFilter');
    const modelFilter = document.getElementById('modelFilter');
    const modFilter = document.getElementById('modFilter');
    
    if (searchInput) searchInput.value = '';
    if (lengthMin) lengthMin.value = 0;
    if (lengthMax) lengthMax.value = 100;
    if (activityFilter) activityFilter.value = 'all';
    if (structureFilter) structureFilter.value = 'all';
    if (pdbFilter) pdbFilter.value = 'all';
    if (transportFilter) transportFilter.value = 'all';
    if (modelFilter) modelFilter.value = 'all';
    if (modFilter) modFilter.value = 'all';
    
    selectedAAs = [];
    document.querySelectorAll('.aa-btn-compact').forEach(btn => {
        btn.classList.remove('selected');
    });
    
    filteredPeptides = [...peptidesData];
    updateBrowseStats();
    displayBrowseResults();
}

// Download results as CSV
function downloadResults() {
    if (filteredPeptides.length === 0) {
        alert('No results to download');
        return;
    }
    
    const headers = [
        'ID', 'Peptide Name', 'Sequence', 'Length', 'MW (Da)', 
        'Net Charge', 'Hydrophobicity', 'Structure Type', 'Source Organism',
        'BBB Permeability', 'Transport Type', 'Model', 'PDB ID',
        'Toxicity (Hemolysis)', 'Stability (Serum)', 'PMID', 'DOI', 'Notes'
    ];
    
    const rows = filteredPeptides.map(p => [
        p.id || '',
        p.peptide_name || '',
        p.sequence_one_letter || '',
        p.length || '',
        p.molecular_weight || '',
        p.net_charge || '',
        p.hydrophobicity || '',
        p.structure_type || '',
        p.source_organism || '',
        p.bbb_permeability_value || '',
        p.bbb_transport_type || '',
        p.bbb_model || '',
        p.PDB || '',
        p.toxicity_hemolysis || '',
        p.stability_serum || '',
        p.pmid || '',
        p.doi || '',
        (p.notes || '').replace(/,/g, ';')
    ]);
    
    const csvContent = [headers, ...rows].map(row => 
        row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
    ).join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `barrpeps_results_${new Date().toISOString().slice(0,19).replace(/:/g, '-')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function displayBrowseResults() {
    const container = document.getElementById('resultsContainer');
    if (!container) return;
    
    const count = filteredPeptides.length;
    
    if (count === 0) {
        container.innerHTML = '<div style="text-align: center; padding: 2rem;">No peptides found</div>';
        return;
    }
    
    if (currentView === 'table') {
        displayTableView(container);
    } else {
        displayCardBrowseView(container);
    }
}

function displayTableView(container) {
    let html = `
        <div class="table-view">
            <table>
                <thead>
                    <tr>
                        <th onclick="sortBy('peptide_name')">Name</th>
                        <th onclick="sortBy('sequence_one_letter')">Sequence</th>
                        <th onclick="sortBy('length')">Length</th>
                        <th onclick="sortBy('molecular_weight')">MW (Da)</th>
                        <th>BBB Permeability</th>
                        <th onclick="sortBy('source_organism')">Source</th>
                        <th>PDB</th>
                        <th>Details</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    filteredPeptides.forEach(peptide => {
        const sequenceDisplay = peptide.sequence_one_letter ? 
            (peptide.sequence_one_letter.length > 35 ? 
                peptide.sequence_one_letter.substring(0, 35) + '...' : 
                peptide.sequence_one_letter) : 'N/A';
        
        const permDisplay = peptide.bbb_permeability_value || 'N/A';
        const peptideUrl = getPeptideUrl(peptide.id, peptide.peptide_name);
        
        html += `
            <tr>
                <td style="padding: 0.7rem 0.5rem;">
                    <a href="${peptideUrl}" style="text-decoration: none; color: #2c5282; font-weight: bold; display: inline-block; padding: 0.2rem 0; border-bottom: 1px solid transparent; transition: border-color 0.2s;" 
                       onmouseover="this.style.borderBottomColor='#4299e1'" 
                       onmouseout="this.style.borderBottomColor='transparent'">
                        ${peptide.peptide_name || 'N/A'}
                    </a>
                 </td>
                <td style="font-family: monospace; font-size: 0.65rem;">${sequenceDisplay}</td>
                <td>${peptide.length || 'N/A'}</td>
                <td>${peptide.molecular_weight ? peptide.molecular_weight.toFixed(1) : 'N/A'}</td>
                <td>${permDisplay}</td>
                <td>${peptide.source_organism || 'N/A'}</td>
                <td>${peptide.PDB || '—'}</td>
                <td><a href="${peptideUrl}" class="btn-primary" style="padding: 0.25rem 0.6rem; font-size: 0.65rem; text-decoration: none;">View</a></td>
            </tr>
        `;
    });
    
    html += `</tbody></table></div>`;
    container.innerHTML = html;
}

function displayCardBrowseView(container) {
    let html = '<div class="peptide-grid">';
    
    filteredPeptides.forEach(peptide => {
        const permDisplay = peptide.bbb_permeability_value || 'N/A';
        const peptideUrl = getPeptideUrl(peptide.id, peptide.peptide_name);
        
        html += `
            <div class="peptide-card" onclick="window.location.href='${peptideUrl}'" style="cursor: pointer;">
                <div class="card-header">
                    <h3 style="color: #2c5282;">${peptide.peptide_name || 'Unnamed Peptide'}</h3>
                </div>
                <div class="card-content">
                    <div class="card-row">
                        <div class="card-label">Source:</div>
                        <div class="card-value">${peptide.source_organism || 'N/A'}</div>
                    </div>
                    <div class="card-row">
                        <div class="card-label">Length / MW:</div>
                        <div class="card-value">${peptide.length || 'N/A'} aa / ${peptide.molecular_weight ? peptide.molecular_weight.toFixed(1) : 'N/A'} Da</div>
                    </div>
                    <div class="card-row">
                        <div class="card-label">BBB Permeability:</div>
                        <div class="card-value">${permDisplay}</div>
                    </div>
                    <div class="card-row">
                        <div class="card-label">PDB:</div>
                        <div class="card-value">${peptide.PDB || '—'}</div>
                    </div>
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    container.innerHTML = html;
}

function setView(view) {
    currentView = view;
    const btns = document.querySelectorAll('.toggle-btn');
    btns.forEach(btn => btn.classList.remove('active'));
    if (view === 'table') {
        if (btns[0]) btns[0].classList.add('active');
    } else {
        if (btns[1]) btns[1].classList.add('active');
    }
    displayBrowseResults();
}

function sortBy(column) {
    if (sortColumn === column) {
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        sortColumn = column;
        sortDirection = 'asc';
    }
    
    filteredPeptides.sort((a, b) => {
        let valA = a[column];
        let valB = b[column];
        
        if (valA === undefined || valA === null || valA === '') valA = -Infinity;
        if (valB === undefined || valB === null || valB === '') valB = -Infinity;
        
        if (typeof valA === 'string') {
            valA = valA.toLowerCase();
            valB = valB.toLowerCase();
        }
        
        if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
        if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
        return 0;
    });
    
    displayBrowseResults();
}

// ========== PDB STRUCTURE FUNCTIONS ==========

// Fetch PDB structure from RCSB API
async function fetchPDBStructure(pdbId) {
    if (!pdbId || pdbId === '' || pdbId === 'N/A') {
        return null;
    }
    
    try {
        const response = await fetch(`https://files.rcsb.org/download/${pdbId}.pdb`);
        if (!response.ok) {
            return null;
        }
        return await response.text();
    } catch (error) {
        console.error('Error fetching PDB:', error);
        return null;
    }
}

// Find disulfide bonds by distance between sulfur atoms (one bond per pair)
function findDisulfideBonds(pdbContent) {
    const lines = pdbContent.split('\n');
    const sulfurAtoms = [];
    
    console.log('Searching for sulfur atoms in cysteines...');
    
    // Find all SG (sulfur) atoms in cysteines
    lines.forEach(line => {
        if (line.startsWith('ATOM')) {
            const atomName = line.substring(12, 16).trim();
            const resName = line.substring(17, 20).trim();
            const resSeq = parseInt(line.substring(22, 26).trim());
            
            if ((atomName === 'SG' || atomName === 'S') && resName === 'CYS') {
                const x = parseFloat(line.substring(30, 38));
                const y = parseFloat(line.substring(38, 46));
                const z = parseFloat(line.substring(46, 54));
                
                sulfurAtoms.push({
                    resSeq: resSeq,
                    x: x, y: y, z: z,
                    chain: line.substring(21, 22).trim()
                });
            }
        }
    });
    
    console.log(`Total sulfur atoms found: ${sulfurAtoms.length}`);
    
    // Find pairs within S-S bond distance (1.8 - 2.3 Å)
    const bondsMap = new Map(); // Use Map to store unique bonds by pair key
    
    for (let i = 0; i < sulfurAtoms.length; i++) {
        for (let j = i + 1; j < sulfurAtoms.length; j++) {
            // Skip if it's the same residue (should not happen with j = i+1, but safe)
            if (sulfurAtoms[i].resSeq === sulfurAtoms[j].resSeq) {
                console.log(`Skipping same residue: CYS${sulfurAtoms[i].resSeq} - CYS${sulfurAtoms[j].resSeq}`);
                continue;
            }
            
            const dx = sulfurAtoms[i].x - sulfurAtoms[j].x;
            const dy = sulfurAtoms[i].y - sulfurAtoms[j].y;
            const dz = sulfurAtoms[i].z - sulfurAtoms[j].z;
            const distance = Math.sqrt(dx*dx + dy*dy + dz*dz);
            
            if (distance >= 1.8 && distance <= 2.5) {
                // Create a unique key for this pair of cysteines (order independent)
                const cys1 = sulfurAtoms[i].resSeq;
                const cys2 = sulfurAtoms[j].resSeq;
                const pairKey = `${Math.min(cys1, cys2)}-${Math.max(cys1, cys2)}`;
                
                // Only add if we haven't seen this pair before
                if (!bondsMap.has(pairKey)) {
                    bondsMap.set(pairKey, {
                        cys1: cys1,
                        cys2: cys2,
                        distance: distance,
                        x1: sulfurAtoms[i].x,
                        y1: sulfurAtoms[i].y,
                        z1: sulfurAtoms[i].z,
                        x2: sulfurAtoms[j].x,
                        y2: sulfurAtoms[j].y,
                        z2: sulfurAtoms[j].z
                    });
                    console.log(`Found disulfide bond: CYS${cys1} - CYS${cys2} (${distance.toFixed(2)} Å)`);
                } else {
                    console.log(`Skipping duplicate bond: CYS${cys1} - CYS${cys2}`);
                }
            }
        }
    }
    
    // Convert Map values to array
    const bonds = Array.from(bondsMap.values());
    console.log(`Total unique disulfide bonds found: ${bonds.length}`);
    
    return bonds;
}

// Render PDB structure
function renderPDBStructure(pdbContent, pdbId) {
    const container = document.getElementById('structure-viewer-pdb');
    if (!container) return;
    
    if (!pdbContent) {
        container.innerHTML = `
            <div class="no-structure">
                <p>No PDB structure available for this peptide.</p>
                <p style="font-size: 0.7rem; margin-top: 0.5rem;">PDB ID: ${pdbId || 'N/A'}</p>
            </div>
        `;
        return;
    }
    
    console.log('Rendering PDB structure for:', pdbId);
    
    // Find disulfide bonds (unique pairs only)
    disulfideBonds = findDisulfideBonds(pdbContent);
    
    container.innerHTML = '';
    
    pdbViewer = $3Dmol.createViewer(container, { backgroundColor: 'white' });
    pdbViewer.addModel(pdbContent, 'pdb');
    pdbViewer.zoomTo();
    
    window.pdbContentCache = pdbContent;
    
    setRepresentation('cartoon');
}

function setRepresentation(type) {
    if (!pdbViewer) return;
    
    pdbViewer.removeAllModels();
    pdbViewer.addModel(window.pdbContentCache, 'pdb');
    
    if (type === 'cartoon') {
        // Cartoon representation
        pdbViewer.setStyle({}, { 
            cartoon: { 
                colorscheme: 'ss',
                opacity: 0.85
            } 
        });
        
        // Highlight sulfur atoms in cysteines
        pdbViewer.addStyle({resn: "CYS", atom: "SG"}, { 
            sphere: {
                color: 0xffaa00,
                scale: 0.3,
                opacity: 0.9
            }
        });
        
        // Remove existing shapes before adding new ones
        pdbViewer.removeAllShapes();
        
        // Add disulfide bonds - each bond only once, skip self-bonds
if (disulfideBonds && disulfideBonds.length > 0) {
    let addedCount = 0;
    disulfideBonds.forEach((bond, index) => {
        // Skip if it's the same residue
        if (bond.cys1 === bond.cys2) {
            console.log(`Skipping self-bond: CYS${bond.cys1} - CYS${bond.cys2}`);
            return;
        }
        
        if (bond.x1 && bond.x2) {
            try {
                pdbViewer.addCylinder({
                    start: {x: bond.x1, y: bond.y1, z: bond.z1},
                    end: {x: bond.x2, y: bond.y2, z: bond.z2},
                    radius: 0.1,
                    color: 0xffaa00,
                    fromCap: 1,
                    toCap: 1
                });
                addedCount++;
                console.log(`Added bond ${addedCount}: CYS${bond.cys1} - CYS${bond.cys2}`);
            } catch(e) {
                console.error('Error adding cylinder:', e);
            }
        }
    });
    console.log(`Total added: ${addedCount} disulfide bond(s)`);
} else {
    console.log('No disulfide bonds to add');
}
        
        currentRepresentation = 'cartoon';
    } 
    else if (type === 'ballAndStick') {
        // Ball and stick representation
        pdbViewer.setStyle({}, { 
            stick: { colorscheme: 'elem', radius: 0.12 },
            sphere: { colorscheme: 'elem', scale: 0.25 }
        });
        
        // Highlight sulfur atoms in cysteines
        pdbViewer.addStyle({resn: "CYS", atom: "SG"}, { 
            sphere: {
                color: 0xffaa00,
                scale: 0.4,
                opacity: 0.9
            }
        });
        
        // Remove existing shapes before adding new ones
        pdbViewer.removeAllShapes();
        
        // Add disulfide bonds - each bond only once, skip self-bonds
if (disulfideBonds && disulfideBonds.length > 0) {
    disulfideBonds.forEach((bond) => {
        // Skip if it's the same residue
        if (bond.cys1 === bond.cys2) {
            return;
        }
        
        if (bond.x1 && bond.x2) {
            try {
                pdbViewer.addCylinder({
                    start: {x: bond.x1, y: bond.y1, z: bond.z1},
                    end: {x: bond.x2, y: bond.y2, z: bond.z2},
                    radius: 0.12,
                    color: 0xffaa00,
                    fromCap: 1,
                    toCap: 1
                });
            } catch(e) {
                console.error('Error adding cylinder:', e);
            }
        }
    });
}
        
        currentRepresentation = 'ballAndStick';
    }
    
    pdbViewer.zoomTo();
    pdbViewer.render();
    
    const cartoonBtn = document.getElementById('btn-cartoon');
    const ballBtn = document.getElementById('btn-ballstick');
    
    if (cartoonBtn) cartoonBtn.classList.remove('active');
    if (ballBtn) ballBtn.classList.remove('active');
    
    if (type === 'cartoon' && cartoonBtn) cartoonBtn.classList.add('active');
    else if (type === 'ballAndStick' && ballBtn) ballBtn.classList.add('active');
}

function resetPDBView() {
    if (!pdbViewer) return;
    pdbViewer.zoomTo();
    pdbViewer.render();
}


// ========== PEPTIDE DETAIL PAGE FUNCTIONS ==========

async function initPeptidePage() {
    console.log('Initializing peptide page');
    
    const urlParams = new URLSearchParams(window.location.search);
    const peptideId = parseInt(urlParams.get('id'));
    const peptide = peptidesData.find(p => p.id === peptideId);
    
    if (!peptide) {
        const detailContainer = document.getElementById('peptideDetail');
        if (detailContainer) {
            detailContainer.innerHTML = `
                <div class="error-message">
                    <p>Peptide not found</p>
                    <a href="browse.html" class="btn-primary">Browse Database</a>
                </div>
            `;
        }
        return;
    }
    
    document.title = `${peptide.peptide_name} - BarrPeps Database`;
    
    let pdbContent = null;
    let pdbId = peptide.PDB && peptide.PDB !== '' ? peptide.PDB : null;
    
    if (pdbId) {
        pdbContent = await fetchPDBStructure(pdbId);
        window.pdbContentCache = pdbContent;
    }
    
    displayPeptideDetail(peptide, pdbContent, pdbId);
}

function displayPeptideDetail(peptide, pdbContent, pdbId) {
    const hasPDB = pdbContent !== null;
    const hasSMILES = peptide.SMILES && peptide.SMILES !== '' && peptide.SMILES !== 'N/A';
    
    const html = `
        <div class="peptide-detail-container">
            <div style="margin-bottom: 1rem;">
                <a href="browse.html" class="btn-secondary back-button" style="display: inline-block; text-decoration: none;">← Back to Browse</a>
                <h1 style="color: #2c5282; font-size: 1.4rem; margin-bottom: 0.2rem;">${peptide.peptide_name || 'N/A'}</h1>
                <p style="color: #718096; font-size: 0.7rem;">ID: ${peptide.id} | Last updated: ${peptide.created_date || 'N/A'}</p>
            </div>
            
            <div class="structure-viewer">
                <h3 style="font-size: 0.9rem; margin-bottom: 0.6rem;">3D Structure Visualization</h3>
                ${hasPDB ? '<div id="structure-viewer-pdb" class="structure-container"></div>' : '<div class="no-structure"><p>No PDB structure available for this peptide.</p></div>'}
                
                ${hasPDB ? `
                <div class="structure-controls">
                    <button id="btn-cartoon" class="active" onclick="setRepresentation('cartoon')">Cartoon</button>
                    <button id="btn-ballstick" onclick="setRepresentation('ballAndStick')">Ball & Stick</button>
                </div>
                <div class="structure-legend">
    <div class="legend-item"><div class="legend-color carbon"></div><span>Carbon (C)</span></div>
    <div class="legend-item"><div class="legend-color oxygen"></div><span>Oxygen (O)</span></div>
    <div class="legend-item"><div class="legend-color nitrogen"></div><span>Nitrogen (N)</span></div>
    <div class="legend-item"><div class="legend-color sulfur"></div><span>Sulfur (S)</span></div>
    <div class="legend-item"><div class="legend-color disulfide"></div><span>Disulfide Bridge (S-S)</span></div>
    <div class="legend-item"><div class="legend-color cysteine"></div><span>Cysteine (C)</span></div>
</div>
                <div class="pdb-info">
                    <strong>PDB ID: ${pdbId || peptide.PDB || 'N/A'}</strong> | 
                    <a href="https://www.rcsb.org/structure/${pdbId || peptide.PDB}" target="_blank">View on RCSB.org</a>
                </div>
                ` : ''}
            </div>
            
            <div class="detail-section">
                <h3>Basic Information</h3>
                <div class="detail-row"><span class="detail-label">Peptide Name:</span><span class="detail-value">${peptide.peptide_name || 'N/A'}</span></div>
                <div class="detail-row"><span class="detail-label">Sequence (1-letter):</span><span class="detail-value" style="font-family: monospace; font-size: 0.8rem; word-break: break-all;">${peptide.sequence_one_letter || 'N/A'}</span></div>
                <div class="detail-row"><span class="detail-label">Sequence (3-letter):</span><span class="detail-value" style="font-size: 0.7rem; word-break: break-all;">${peptide.sequence_three_letter || 'N/A'}</span></div>
                <div class="detail-row"><span class="detail-label">Length:</span><span class="detail-value">${peptide.length || 'N/A'} aa</span></div>
                <div class="detail-row"><span class="detail-label">Molecular Weight:</span><span class="detail-value">${peptide.molecular_weight ? peptide.molecular_weight.toFixed(2) : 'N/A'} Da</span></div>
                <div class="detail-row"><span class="detail-label">Net Charge:</span><span class="detail-value">${peptide.net_charge || 'N/A'}</span></div>
                <div class="detail-row"><span class="detail-label">Hydrophobicity:</span><span class="detail-value">${peptide.hydrophobicity || 'N/A'}</span></div>
            </div>
            
            <div class="detail-section">
                <h3>Structural Properties</h3>
                <div class="detail-row"><span class="detail-label">Structure Type:</span><span class="detail-value">${peptide.structure_type || 'N/A'}</span></div>
                <div class="detail-row"><span class="detail-label">PDB ID:</span><span class="detail-value">${pdbId ? `<a href="https://www.rcsb.org/structure/${pdbId}" target="_blank">${pdbId}</a>` : (peptide.PDB || 'N/A')}</span></div>
                ${hasSMILES ? `
                <div class="detail-row">
                    <span class="detail-label">SMILES:</span>
                    <span class="detail-value">
                        <div class="smiles-container">
                            <strong style="font-size: 0.7rem;">Simplified Molecular Input Line Entry System</strong>
                            <div style="font-family: monospace; font-size: 0.6rem; word-break: break-all; background: white; padding: 0.5rem; border-radius: 4px; border: 1px solid #e2e8f0; margin-top: 0.4rem;">${escapeHtml(peptide.SMILES)}</div>
                            <button class="copy-btn" onclick="copySMILES('${escapeHtml(peptide.SMILES)}')">Copy SMILES</button>
                            <p style="font-size: 0.6rem; color: #718096; margin-top: 0.4rem;">SMILES is a specification for describing chemical molecule structures using ASCII strings.</p>
                        </div>
                    </span>
                </div>
                ` : '<div class="detail-row"><span class="detail-label">SMILES:</span><span class="detail-value">N/A</span></div>'}
            </div>
            
            <div class="detail-section">
                <h3>Blood-Brain Barrier Penetration</h3>
                <div class="detail-row"><span class="detail-label">Permeability Value:</span><span class="detail-value">${peptide.bbb_permeability_value || 'N/A'}</span></div>
                <div class="detail-row"><span class="detail-label">Transport Type:</span><span class="detail-value">${peptide.bbb_transport_type || 'N/A'}</span></div>
                <div class="detail-row"><span class="detail-label">Model:</span><span class="detail-value">${peptide.bbb_model || 'N/A'}</span></div>
            </div>
            
            <div class="detail-section">
                <h3>Biological Source</h3>
                <div class="detail-row"><span class="detail-label">Organism:</span><span class="detail-value">${peptide.source_organism || 'N/A'}</span></div>
            </div>
            
            <div class="detail-section">
                <h3>Toxicity & Stability</h3>
                <div class="detail-row"><span class="detail-label">Hemolysis (LC50):</span><span class="detail-value">${peptide.toxicity_hemolysis || 'N/A'} µM</span></div>
                <div class="detail-row"><span class="detail-label">Serum Stability:</span><span class="detail-value">${peptide.stability_serum || 'N/A'} h</span></div>
                <div class="detail-row"><span class="detail-label">Synergy:</span><span class="detail-value">${peptide.synergy || 'N/A'}</span></div>
            </div>
            
            <div class="detail-section">
                <h3>References</h3>
                <div class="detail-row"><span class="detail-label">PMID:</span><span class="detail-value">${peptide.pmid || 'N/A'}</span></div>
                <div class="detail-row"><span class="detail-label">DOI:</span><span class="detail-value">${peptide.doi ? `<a href="https://doi.org/${peptide.doi}" target="_blank">${peptide.doi}</a>` : 'N/A'}</span></div>
                <div class="detail-row"><span class="detail-label">Notes:</span><span class="detail-value">${peptide.notes || 'N/A'}</span></div>
                <div class="detail-row"><span class="detail-label">Created Date:</span><span class="detail-value">${peptide.created_date || 'N/A'}</span></div>
            </div>
        </div>
    `;
    
    const detailContainer = document.getElementById('peptideDetail');
    if (detailContainer) {
        detailContainer.innerHTML = html;
    }
    
    if (hasPDB && pdbContent) {
        setTimeout(() => {
            renderPDBStructure(pdbContent, pdbId);
        }, 100);
    }
}

// ========== GLOBAL EXPORTS ==========

window.searchPeptides = applyAllFilters;
window.resetFilters = resetAllFilters;
window.setView = setView;
window.sortBy = sortBy;
window.setRepresentation = setRepresentation;
window.resetPDBView = resetPDBView;
window.copySMILES = copySMILES;
window.showUnderConstruction = showUnderConstruction;
window.closeModal = closeModal;
window.applyAllFilters = applyAllFilters;
window.resetAllFilters = resetAllFilters;
window.downloadResults = downloadResults;

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, starting CSV load...');
    loadCSV();
});
