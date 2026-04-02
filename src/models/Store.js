module.exports = (sequelize, DataTypes) => {
  return sequelize.define("Store", {
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    slug: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    },
    logo: {
      type: DataTypes.STRING,
      allowNull: true
    },
    primaryColor: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "#198754"
    },
    secondaryColor: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "#212529"
    },
    themeConfig: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: {}
    },
    shippingConfig: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: {
        cities: []
      }
    },
    notificationConfig: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: {
        notifyOnNewOrder: true,
        notifyOnLowStock: true,
        orderEmails: [],
        lowStockEmails: []
      }
    },
    contactPhone: {
      type: DataTypes.STRING,
      allowNull: true
    },
    contactEmail: {
      type: DataTypes.STRING,
      allowNull: true
    },
    whatsapp: {
      type: DataTypes.STRING,
      allowNull: true
    }
  });
};
