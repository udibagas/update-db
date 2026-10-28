import { toSqlDate } from "../helpers/sql.js";

const mapper = {
  A: (row) => {
    const [
      no_faktur,
      tgl,
      berat,
      harga,
      nama_barang,
      ,
      no_faktur_beli,
      tgl_beli,
      berat_beli,
      harga_beli,
      nama_barang_beli,
    ] = row;

    return {
      no_faktur: String(no_faktur || "").trim(),
      tgl: toSqlDate(tgl),
      berat: Number(berat),
      harga: Math.round(Number(harga)),
      nama_barang: String(nama_barang || "").trim(),
      no_faktur_beli: String(no_faktur_beli || "").trim(),
      tgl_beli: toSqlDate(tgl_beli),
      berat_beli: Number(berat_beli),
      harga_beli: Math.round(Number(harga_beli)),
      nama_barang_beli: String(nama_barang_beli || "").trim(),
    };
  },

  B: (row) => {
    const [
      no_faktur,
      tgl,
      berat,
      kadar,
      harga,
      ,
      no_faktur_beli,
      tgl_beli,
      nama_barang_beli,
      kondisi,
      berat_beli,
      kadar_beli,
      harga_beli,
    ] = row;

    return {
      no_faktur: String(no_faktur || "").trim(),
      tgl: toSqlDate(tgl),
      berat: Number(berat),
      kadar: Number(kadar),
      harga: Math.round(Number(harga)),
      no_faktur_beli: String(no_faktur_beli || "").trim(),
      tgl_beli: toSqlDate(tgl_beli),
      nama_barang_beli: String(nama_barang_beli || "").trim(),
      kondisi: String(kondisi || "").trim(),
      berat_beli: Number(berat_beli),
      kadar_beli: Number(kadar_beli),
      harga_beli: Math.round(Number(harga_beli)),
    };
  },
};

export default mapper;
