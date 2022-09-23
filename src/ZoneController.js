export const KEYPOINT_TYPES = [
  'leftAnkle',
  'leftEar',
  'leftElbow',
  'leftEye',
  'leftHip',
  'leftKnee',
  'leftShoulder',
  'leftWrist',
  'nose',
  'rightAnkle',
  'rightEar',
  'rightElbow',
  'rightEye',
  'rightHip',
  'rightKnee',
  'rightShoulder',
  'rightWrist',
];

export default class ZoneController {
  constructor(zones, fileInput) {
    this.zones = zones;
    this._zoneGuiFolders = [];
    this._nextZoneId = 0;
    this._fileInput = fileInput;
  }

  addZonesFolderTo(gui) {
    const folder = gui.addFolder("Zones");
    folder.add(this, 'export').name("Export JSON")
    folder.add(this, 'import').name("Import JSON")
    folder.add(this, 'add').name("Add")
    folder.add(this, 'removeAll').name("Remove all")
    this._guiFolder = folder;
  }

  export() {
    let writer = createWriter('zones.json');
    writer.write(JSON.stringify(this.zones));
    writer.close();
  }

  import() {
    this._fileInput.onchange = (ev) => {
      var reader = new FileReader();
      reader.onload = (e) => {
        console.log("read", e.target.result)
        this.zones.splice(0, this.zones.length)
        const newZones = JSON.parse(e.target.result)
        this.zones.push(...newZones)
        this._updateZoneFolders();
      };
      reader.readAsText(ev.target.files[0]);
    }
    this._fileInput.click();
  }

  add(newZone) {
    const randomKeypoint = KEYPOINT_TYPES[Math.floor(Math.random() * KEYPOINT_TYPES.length)];
    const id = this._getNextZoneId();
    this.zones.push({
      x: 0,
      y: 0,
      width: 4,
      height: 4,
      relativeTo: randomKeypoint,
      ...newZone,
      id,
      remove: () => this.remove(id)
    });
    this._updateZoneFolders();
    console.log("Zones:", this.zones);
  }

  remove(idx) {
    console.log("Remove zone id", idx)
    const newZones = this.zones.filter(zone => zone.id != idx);
    this.zones.splice(0, this.zones.length)
    this.zones.push(...newZones)
    this._updateZoneFolders();
  }

  removeAll() {
    if (this.zones.length == 0 || confirm("Are you sure you want to remove all zones?")) {
      this.zones.splice(0, this.zones.length)
      this._updateZoneFolders();
    }
  }

  _getNextZoneId() {
    return this._nextZoneId += 1;
  }

  _updateZoneFolders() {
    // Destroy all zone folders
    for (let i = 0; i < this._zoneGuiFolders.length; i++) {
      const zoneFolder = this._zoneGuiFolders[i];
      zoneFolder.destroy();
    }

    for (let i = 0; i < this.zones.length; i++) {
      const zone = this.zones[i];
      const zoneFolder = this._guiFolder.addFolder(`Zone ${i + 1}`);
      zoneFolder.add(zone, 'x', -30, 30).name("X");
      zoneFolder.add(zone, 'y', -30, 30).name("Y");
      zoneFolder.add(zone, 'width', 0, 30).name("Width");
      zoneFolder.add(zone, 'height', 0, 40).name("Height");
      zoneFolder.add(zone, 'relativeTo', KEYPOINT_TYPES).name("Relative to");
      zoneFolder.add(zone, 'remove').name("Remove");
      this._zoneGuiFolders.push(zoneFolder);
    }
  }
}