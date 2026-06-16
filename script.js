const warehouses = [
  {
    id: "merkez",
    name: "Merkez Depo",
    code: "MD-01",
    occupancy: 82,
    capacity: 12400,
    stockValue: 9850,
    inbound: 148,
    outbound: 112,
  },
  {
    id: "uretim",
    name: "Uretim Deposu",
    code: "UD-02",
    occupancy: 68,
    capacity: 8600,
    stockValue: 5848,
    inbound: 96,
    outbound: 131,
  },
  {
    id: "saha",
    name: "Saha Deposu",
    code: "SD-03",
    occupancy: 74,
    capacity: 5400,
    stockValue: 3996,
    inbound: 55,
    outbound: 62,
  },
  {
    id: "iade",
    name: "Iade Deposu",
    code: "ID-04",
    occupancy: 41,
    capacity: 2200,
    stockValue: 902,
    inbound: 34,
    outbound: 19,
  },
];

const materials = [
  {
    name: "Rulman 6205",
    warehouse: "merkez",
    stock: 1240,
    min: 600,
    trend: "ok",
  },
  {
    name: "Hidrolik Hortum",
    warehouse: "uretim",
    stock: 280,
    min: 320,
    trend: "risk",
  },
  {
    name: "Motor Govdesi",
    warehouse: "merkez",
    stock: 176,
    min: 150,
    trend: "watch",
  },
  {
    name: "Bakim Kiti A",
    warehouse: "saha",
    stock: 94,
    min: 90,
    trend: "watch",
  },
  {
    name: "Filtre Kartusu",
    warehouse: "iade",
    stock: 42,
    min: 75,
    trend: "risk",
  },
  {
    name: "Ambalaj Paleti",
    warehouse: "uretim",
    stock: 1840,
    min: 1200,
    trend: "ok",
  },
  {
    name: "Sensor Modul",
    warehouse: "saha",
    stock: 320,
    min: 250,
    trend: "ok",
  },
];

const transfers = [
  {
    from: "Merkez",
    to: "Uretim",
    warehouse: "merkez",
    material: "Rulman 6205",
    count: 48,
    status: "Yolda",
  },
  {
    from: "Uretim",
    to: "Saha",
    warehouse: "uretim",
    material: "Bakim Kiti A",
    count: 24,
    status: "Planlandi",
  },
  {
    from: "Saha",
    to: "Iade",
    warehouse: "saha",
    material: "Sensor Modul",
    count: 11,
    status: "Kontrol",
  },
  {
    from: "Iade",
    to: "Merkez",
    warehouse: "iade",
    material: "Filtre Kartusu",
    count: 18,
    status: "Kabul",
  },
];

const movement = [
  { day: "Pzt", in: 125, out: 88 },
  { day: "Sal", in: 154, out: 106 },
  { day: "Car", in: 112, out: 132 },
  { day: "Per", in: 176, out: 149 },
  { day: "Cum", in: 201, out: 162 },
  { day: "Cmt", in: 98, out: 72 },
  { day: "Paz", in: 84, out: 64 },
];

const formatter = new Intl.NumberFormat("tr-TR");

const warehouseFilter = document.querySelector("#warehouseFilter");
const warehouseCards = document.querySelector("#warehouseCards");
const materialRows = document.querySelector("#materialRows");
const transferList = document.querySelector("#transferList");
const movementChart = document.querySelector("#movementChart");

function getFilteredData() {
  const selectedWarehouse = warehouseFilter.value;
  const filterByWarehouse = (item) => selectedWarehouse === "all" || item.warehouse === selectedWarehouse;

  return {
    warehouses:
      selectedWarehouse === "all"
        ? warehouses
        : warehouses.filter((warehouse) => warehouse.id === selectedWarehouse),
    materials: materials.filter(filterByWarehouse),
    transfers: transfers.filter(filterByWarehouse),
  };
}

function renderKpis(data) {
  const stockTotal = data.materials.reduce((sum, item) => sum + item.stock, 0);
  const avgOccupancy = data.warehouses.length
    ? Math.round(data.warehouses.reduce((sum, warehouse) => sum + warehouse.occupancy, 0) / data.warehouses.length)
    : 0;
  const todayMoves =
    data.transfers.reduce((sum, transfer) => sum + transfer.count, 0) +
    data.warehouses.reduce((sum, warehouse) => sum + warehouse.inbound + warehouse.outbound, 0);
  const criticalItems = data.materials.filter((item) => item.stock < item.min).length;

  document.querySelector("#totalMaterials").textContent = formatter.format(stockTotal);
  document.querySelector("#avgOccupancy").textContent = `${avgOccupancy}%`;
  document.querySelector("#todayMoves").textContent = formatter.format(todayMoves);
  document.querySelector("#criticalItems").textContent = criticalItems;
}

function renderWarehouses(items) {
  warehouseCards.innerHTML = items
    .map((warehouse) => {
      const angle = Math.round((warehouse.occupancy / 100) * 360);

      return `
        <article class="warehouse-card">
          <div class="warehouse-title">
            <div>
              <h3>${warehouse.name}</h3>
              <span>${warehouse.code}</span>
            </div>
            <span>${warehouse.occupancy >= 80 ? "Yogun" : "Normal"}</span>
          </div>
          <div class="donut" style="--value: ${angle}deg">
            <strong>${warehouse.occupancy}%</strong>
          </div>
          <div class="warehouse-meta">
            <span>Kapasite <b>${formatter.format(warehouse.capacity)}</b></span>
            <span>Mevcut Stok <b>${formatter.format(warehouse.stockValue)}</b></span>
            <span>Giris <b>${warehouse.inbound}</b></span>
            <span>Cikis <b>${warehouse.outbound}</b></span>
          </div>
        </article>
      `;
    })
    .join("");
}

function getStatus(item) {
  if (item.stock < item.min) {
    return { label: "Kritik", className: "status-risk" };
  }

  if (item.stock <= item.min * 1.25 || item.trend === "watch") {
    return { label: "Izle", className: "status-watch" };
  }

  return { label: "Guvenli", className: "status-ok" };
}

function renderMaterials(items) {
  if (!items.length) {
    materialRows.innerHTML = '<tr><td colspan="5">Secilen depo icin malzeme bulunamadi.</td></tr>';
    return;
  }

  materialRows.innerHTML = items
    .map((item) => {
      const status = getStatus(item);
      const warehouseName = warehouses.find((warehouse) => warehouse.id === item.warehouse)?.name ?? "-";

      return `
        <tr>
          <td>${item.name}</td>
          <td>${warehouseName}</td>
          <td>${formatter.format(item.stock)}</td>
          <td>${formatter.format(item.min)}</td>
          <td><span class="status-pill ${status.className}">${status.label}</span></td>
        </tr>
      `;
    })
    .join("");
}

function renderTransfers(items) {
  if (!items.length) {
    transferList.innerHTML = "<li><span>Secilen depo icin aktif transfer yok.</span></li>";
    return;
  }

  transferList.innerHTML = items
    .map(
      (transfer) => `
        <li>
          <span>
            <span class="transfer-route">${transfer.from} -> ${transfer.to}</span>
            <span class="transfer-detail">${transfer.material} / ${transfer.status}</span>
          </span>
          <span class="transfer-count">${transfer.count}</span>
        </li>
      `,
    )
    .join("");
}

function renderMovementChart() {
  const maxValue = Math.max(...movement.flatMap((item) => [item.in, item.out]));

  movementChart.innerHTML = movement
    .map((item) => {
      const inHeight = Math.round((item.in / maxValue) * 100);
      const outHeight = Math.round((item.out / maxValue) * 100);

      return `
        <div class="bar-group">
          <div class="bar-pair">
            <div class="bar bar-in" title="${item.day} giris: ${item.in}" style="height: ${inHeight}%"></div>
            <div class="bar bar-out" title="${item.day} cikis: ${item.out}" style="height: ${outHeight}%"></div>
          </div>
          <div class="bar-label">${item.day}</div>
        </div>
      `;
    })
    .join("");
}

function renderDashboard() {
  const data = getFilteredData();

  renderKpis(data);
  renderWarehouses(data.warehouses);
  renderMaterials(data.materials);
  renderTransfers(data.transfers);
}

warehouseFilter.addEventListener("change", renderDashboard);

renderMovementChart();
renderDashboard();
