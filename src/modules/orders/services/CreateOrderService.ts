import { inject, injectable } from 'tsyringe';

import AppError from '@shared/errors/AppError';

import IProductsRepository from '@modules/products/repositories/IProductsRepository';
import ICustomersRepository from '@modules/customers/repositories/ICustomersRepository';
import Order from '../infra/typeorm/entities/Order';
import IOrdersRepository from '../repositories/IOrdersRepository';

interface IProduct {
  id: string;
  quantity: number;
}

interface IRequest {
  customer_id: string;
  products: IProduct[];
}

@injectable()
class CreateOrderService {
  constructor(
    @inject('OrdersRepository')
    private ordersRepository: IOrdersRepository,

    @inject('ProductsRepository')
    private productsRepository: IProductsRepository,

    @inject('CustomersRepository')
    private customersRepository: ICustomersRepository,
  ) {}

  public async execute({ customer_id, products }: IRequest): Promise<Order> {
    const customer = await this.customersRepository.findById(customer_id);

    if (!customer) {
      throw new AppError('Customer not found.');
    }

    const existentProducts = await this.productsRepository.findAllById(
      products,
    );

    if (!existentProducts.length) {
      throw new AppError('Could not find any products with the given ids');
    }

    const existentProductsIds = existentProducts.map(product => product.id);

    const checkInexistentProductsIds = products.filter(
      product => !existentProductsIds.includes(product.id),
    );

    if (checkInexistentProductsIds.length) {
      throw new AppError(
        `Could not find product ${checkInexistentProductsIds.map(
          product => product.id,
        )}`,
      );
    }

    const fintProductsWithNoQuantityAvailable = products.filter(
      (product, index) =>
        existentProducts.filter(p => p.id === product.id)[index].quantity <
        product.quantity,
    );

    if (fintProductsWithNoQuantityAvailable.length) {
      throw new AppError(
        `The quantity ${fintProductsWithNoQuantityAvailable.map(
          p => p.quantity,
        )} is not available for ${fintProductsWithNoQuantityAvailable.map(
          p => p.id,
        )}`,
      );
    }

    const serializeProducts = products.map((product, index) => ({
      product_id: product.id,
      quantity: product.quantity,
      price: existentProducts.filter(p => p.id === product.id)[index].price,
    }));

    const order = await this.ordersRepository.create({
      customer,
      products: serializeProducts,
    });

    const { order_products } = order;

    const orderedProductsQuantity = order_products.map((product, index) => ({
      id: product.product_id,
      quantity:
        existentProducts.filter(p => p.id === product.product_id)[index]
          .quantity - product.quantity,
    }));

    await this.productsRepository.updateQuantity(orderedProductsQuantity);

    return order;
  }
}

export default CreateOrderService;
