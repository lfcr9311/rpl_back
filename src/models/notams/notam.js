"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotamModel = void 0;
class NotamModel {
    id;
    number;
    qcode;
    status;
    category;
    dist;
    type;
    issuedAt;
    location;
    fir;
    validFromRaw;
    validToRaw;
    validFrom;
    validTo;
    dailyWindowsRaw;
    textE;
    lowerLimit;
    upperLimit;
    geo;
    geoUrl;
    traffic;
    purpose;
    scope;
    rawPayload;
    constructor(props) {
        this.id = props.id;
        this.number = props.number;
        this.qcode = props.qcode ?? null;
        this.status = props.status ?? null;
        this.category = props.category ?? null;
        this.dist = props.dist ?? null;
        this.type = props.type ?? null;
        this.issuedAt = props.issuedAt ?? null;
        this.location = props.location ?? null;
        this.fir = props.fir ?? null;
        this.validFromRaw = props.validFromRaw ?? null;
        this.validToRaw = props.validToRaw ?? null;
        this.validFrom = props.validFrom ?? null;
        this.validTo = props.validTo ?? null;
        this.dailyWindowsRaw = props.dailyWindowsRaw ?? null;
        this.textE = props.textE ?? null;
        this.lowerLimit = props.lowerLimit ?? null;
        this.upperLimit = props.upperLimit ?? null;
        this.geo = props.geo ?? null;
        this.geoUrl = props.geoUrl ?? null;
        this.traffic = props.traffic ?? null;
        this.purpose = props.purpose ?? null;
        this.scope = props.scope ?? null;
        this.rawPayload = props.rawPayload ?? null;
    }
}
exports.NotamModel = NotamModel;
//# sourceMappingURL=notam.js.map