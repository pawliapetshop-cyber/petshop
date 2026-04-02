module.exports = (sequelize, DataTypes) => {
  const Order = sequelize.define("Order", {
    name: DataTypes.STRING,
    document: DataTypes.STRING,
    email: DataTypes.STRING,
    phone: DataTypes.STRING,
    city: DataTypes.STRING,
    address: DataTypes.STRING,
    paymentMethod: DataTypes.STRING,
    paymentReference: {
      type: DataTypes.STRING,
      allowNull: true
    },
    paymentProofImage: {
      type: DataTypes.STRING,
      allowNull: true
    },
    paymentReceivedAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    paymentValidatedAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    couponCode: {
      type: DataTypes.STRING,
      allowNull: true
    },
    couponDiscount: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0
    },
    shippingCost: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0
    },
    subtotal: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0
    },
    total: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0
    },
    pdf: { type: DataTypes.STRING, allowNull: true },
    internalNotes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    acceptedAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    preparingAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    shippedAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    deliveredAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    rejectedAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    statusHistory: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: []
    },

    status: {
      type: DataTypes.STRING,
      defaultValue: "pendiente" // pendiente | aceptado | rechazado
    }
  });

  return Order;
};
