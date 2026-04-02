module.exports = (sequelize, DataTypes) => {
  return sequelize.define("SideAd", {
    position: {
      type: DataTypes.STRING,
      allowNull: false
    },
    image: {
      type: DataTypes.STRING,
      allowNull: false
    },
    targetUrl: {
      type: DataTypes.STRING,
      allowNull: true
    },
    title: {
      type: DataTypes.STRING,
      allowNull: true
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    }
  });
};
